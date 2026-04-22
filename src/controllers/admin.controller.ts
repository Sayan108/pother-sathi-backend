import mongoose from "mongoose";
import { Request, Response } from "express";
import { Driver } from "../models/Driver";
import { RechargeRequest } from "../models/RechargeRequest";
import { Transaction } from "../models/Transaction";
import { env } from "../config/environment";
import { sendSuccess, sendError, sendNotFound } from "../utils/response";

export async function getRechargeRequests(
  req: Request,
  res: Response,
): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  const status = (req.query.status as string) || "pending";
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const [requests, total] = await Promise.all([
    RechargeRequest.find(filter)
      .populate("driverId", "phone name accountStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RechargeRequest.countDocuments(filter),
  ]);

  sendSuccess(res, "Recharge requests fetched", { requests }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getPendingDrivers(
  req: Request,
  res: Response,
): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  const [drivers, total] = await Promise.all([
    Driver.find({ accountStatus: "pending" })
      .select(
        "phone countryCode name vehicleType vehicleModel vehicleNumber accountStatus walletBalance",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments({ accountStatus: "pending" }),
  ]);

  sendSuccess(res, "Pending driver approvals fetched", { drivers }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function verifyDriver(req: Request, res: Response): Promise<void> {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "pending") {
    sendError(res, "Only pending drivers can be verified", 400);
    return;
  }

  const balanceBefore = driver.walletBalance;
  driver.accountStatus = "verified";
  driver.isVerified = true;
  driver.walletBalance += env.DRIVER_VERIFICATION_BONUS;
  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount: env.DRIVER_VERIFICATION_BONUS,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Driver verified by admin and credited verification bonus`,
    status: "completed",
  });

  sendSuccess(res, "Driver verified and wallet credited", {
    driverId: driver._id,
    walletBalance: driver.walletBalance,
    accountStatus: driver.accountStatus,
  });
}

export async function rejectDriver(req: Request, res: Response): Promise<void> {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "pending") {
    sendError(res, "Only pending drivers can be rejected", 400);
    return;
  }

  driver.accountStatus = "rejected";
  driver.isVerified = false;
  await driver.save();

  sendSuccess(res, "Driver verification rejected", {
    driverId: driver._id,
    accountStatus: driver.accountStatus,
  });
}

export async function adjustDriverWallet(
  req: Request,
  res: Response,
): Promise<void> {
  const driverId = req.params.id;
  const { action, amount, description } = req.body as {
    action: "credit" | "debit" | "set";
    amount: number;
    description?: string;
  };

  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  if (!action || typeof amount !== "number" || amount < 0) {
    sendError(res, "Invalid wallet adjustment payload", 400);
    return;
  }

  const balanceBefore = driver.walletBalance;
  let transactionAmount = 0;
  if (action === "credit") {
    driver.walletBalance += amount;
    transactionAmount = amount;
  } else if (action === "debit") {
    const deduction = Math.min(driver.walletBalance, amount);
    driver.walletBalance -= deduction;
    transactionAmount = -deduction;
  } else {
    driver.walletBalance = amount;
    transactionAmount = amount - balanceBefore;
  }

  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: transactionAmount >= 0 ? "wallet_recharge" : "withdrawal",
    amount: transactionAmount,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description:
      description ||
      `Admin wallet adjustment (${action}) for driver ${driver.phone}`,
    status: "completed",
  });

  sendSuccess(res, "Driver wallet updated", {
    driverId: driver._id,
    walletBalance: driver.walletBalance,
  });
}

export async function approveRechargeRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = req.params.id;
  const rechargeRequest = await RechargeRequest.findById(requestId);
  if (!rechargeRequest) {
    sendNotFound(res, "Recharge request not found");
    return;
  }

  if (rechargeRequest.status !== "pending") {
    sendError(res, "Only pending requests can be approved", 400);
    return;
  }

  const driver = await Driver.findById(rechargeRequest.driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  const balanceBefore = driver.walletBalance;
  driver.walletBalance += rechargeRequest.amount;
  await driver.save();

  rechargeRequest.status = "approved";
  rechargeRequest.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
  rechargeRequest.reviewedAt = new Date();
  await rechargeRequest.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount: rechargeRequest.amount,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Admin approved wallet recharge request for ₹${rechargeRequest.amount}`,
    status: "completed",
    reference: rechargeRequest.paymentReference,
  });

  sendSuccess(res, "Recharge request approved", {
    requestId: rechargeRequest._id,
    walletBalance: driver.walletBalance,
  });
}

export async function rejectRechargeRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = req.params.id;
  const rechargeRequest = await RechargeRequest.findById(requestId);
  if (!rechargeRequest) {
    sendNotFound(res, "Recharge request not found");
    return;
  }

  if (rechargeRequest.status !== "pending") {
    sendError(res, "Only pending requests can be rejected", 400);
    return;
  }

  rechargeRequest.status = "rejected";
  rechargeRequest.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
  rechargeRequest.reviewedAt = new Date();
  await rechargeRequest.save();

  sendSuccess(res, "Recharge request rejected", {
    requestId: rechargeRequest._id,
    status: rechargeRequest.status,
  });
}
