import mongoose from "mongoose";
import { Request, Response } from "express";
import { Driver } from "../models/Driver";
import { RechargeRequest } from "../models/RechargeRequest";
import { Transaction } from "../models/Transaction";
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
