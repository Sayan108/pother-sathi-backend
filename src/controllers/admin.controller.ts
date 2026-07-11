import mongoose from "mongoose";
import { Request, Response } from "express";
import { User } from "../models/User";
import { Driver } from "../models/Driver";
import { Ride } from "../models/Ride";
import { BasePrice } from "../models/BasePrice";
import { VehicleType } from "../models/Driver";
import { RechargeRequest } from "../models/RechargeRequest";
import { Transaction } from "../models/Transaction";
import { env } from "../config/environment";
import { sendSuccess, sendError, sendNotFound } from "../utils/response";

type AdminDriverListItem = {
  aadhaarDocument?: string;
  licenseDocument?: string;
  selfieDocument?: string;
  vehicleDocument?: string;
  [key: string]: unknown;
};

function withKycDocuments<T extends AdminDriverListItem>(driver: T): T {
  return {
    ...driver,
    kycDocuments: {
      aadhaarDocument: driver.aadhaarDocument,
      licenseDocument: driver.licenseDocument,
      selfieDocument: driver.selfieDocument,
      vehicleDocument: driver.vehicleDocument,
    },
  };
}

function getPagination(req: Request, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit as string) || defaultLimit, 1),
    maxLimit,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

const DEFAULT_BASE_PRICES: Record<
  VehicleType,
  { basePrice: number; pricePerKm: number; minimumFare: number }
> = {
  bike: { basePrice: 20, pricePerKm: 8, minimumFare: 40 },
  auto: { basePrice: 30, pricePerKm: 15, minimumFare: 70 },
  toto: { basePrice: 25, pricePerKm: 12, minimumFare: 55 },
  car: { basePrice: 40, pricePerKm: 20, minimumFare: 80 },
  delivery: { basePrice: 25, pricePerKm: 10, minimumFare: 50 },
};

const VEHICLE_TYPES = Object.keys(DEFAULT_BASE_PRICES) as VehicleType[];

function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === "string" && VEHICLE_TYPES.includes(value as VehicleType);
}

async function ensureDefaultBasePrices() {
  await Promise.all(
    VEHICLE_TYPES.map((vehicleType) =>
      BasePrice.updateOne(
        { vehicleType },
        {
          $setOnInsert: {
            vehicleType,
            ...DEFAULT_BASE_PRICES[vehicleType],
            isActive: true,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

export async function getRechargeRequests(
  req: Request,
  res: Response,
): Promise<void> {
  const { page, limit, skip } = getPagination(req);

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

export async function getDrivers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;
  const filter: Record<string, unknown> = {};
  if (status) {
    filter.$or = [{ accountStatus: status }, { kycStatus: status }];
  }

  const [drivers, total] = await Promise.all([
    Driver.find(filter)
      .select(
        "phone countryCode name email dob gender vehicleType vehicleModel vehicleNumber vehicleColor vehicleYear serviceArea accountStatus kycStatus kycRejectionReason walletBalance totalEarnings rating totalRatings totalRides aadhaarNumber licenseNumber aadhaarDocument licenseDocument selfieDocument vehicleDocument licenseExpiry isUnionLeader referralCode referralCount isOnline isAvailable isActive isVerified createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments(filter),
  ]);

  sendSuccess(res, "Drivers fetched", {
    drivers: drivers.map(withKycDocuments),
  }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getRiders(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [riders, total] = await Promise.all([
    User.find({ role: "rider" })
      .select(
        "phone countryCode role name email avatar dob gender rating totalRatings totalRides walletBalance isActive isVerified createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments({ role: "rider" }),
  ]);

  sendSuccess(res, "Riders fetched", { riders }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getUnionLeaders(
  req: Request,
  res: Response,
): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [leaders, total] = await Promise.all([
    Driver.find({ isUnionLeader: true })
      .select(
        "phone countryCode name email vehicleType vehicleModel vehicleNumber accountStatus kycStatus walletBalance totalEarnings rating totalRatings totalRides isUnionLeader referralCode referralCount isActive isVerified createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments({ isUnionLeader: true }),
  ]);

  sendSuccess(res, "Union leaders fetched", { leaders }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getRides(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const { status, vehicleType } = req.query;
  const filter: Record<string, unknown> = {};

  if (typeof status === "string" && status.trim()) {
    filter.status = status.trim();
  }
  if (typeof vehicleType === "string" && vehicleType.trim()) {
    filter.vehicleType = vehicleType.trim();
  }

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate("riderId", "name phone")
      .populate("driverId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Ride.countDocuments(filter),
  ]);

  sendSuccess(res, "Rides fetched", { rides }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getBasePrices(
  _req: Request,
  res: Response,
): Promise<void> {
  await ensureDefaultBasePrices();
  const basePrices = await BasePrice.find()
    .sort({ vehicleType: 1 })
    .lean();

  sendSuccess(res, "Base prices fetched", { basePrices });
}

export async function createBasePrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { vehicleType, basePrice, pricePerKm, minimumFare, isActive } = req.body;

  if (!isVehicleType(vehicleType)) {
    sendError(res, "Invalid vehicle type", 400);
    return;
  }

  const price = await BasePrice.findOneAndUpdate(
    { vehicleType },
    {
      $set: {
        basePrice,
        pricePerKm,
        minimumFare,
        isActive: isActive === undefined ? true : isActive,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  sendSuccess(res, "Base price saved", { basePrice: price }, 201);
}

export async function updateBasePrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const update: Record<string, unknown> = {};

  ["basePrice", "pricePerKm", "minimumFare", "isActive"].forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  if (isVehicleType(req.body.vehicleType)) {
    update.vehicleType = req.body.vehicleType;
  }

  const price = await BasePrice.findOneAndUpdate(
    mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { vehicleType: id },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!price) {
    sendNotFound(res, "Base price not found");
    return;
  }

  sendSuccess(res, "Base price updated", { basePrice: price });
}

export async function deleteBasePrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const price = await BasePrice.findOneAndDelete(
    mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { vehicleType: id },
  ).lean();

  if (!price) {
    sendNotFound(res, "Base price not found");
    return;
  }

  sendSuccess(res, "Base price deleted", { basePrice: price });
}

export async function getPendingDrivers(
  req: Request,
  res: Response,
): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [drivers, total] = await Promise.all([
    Driver.find({ $or: [{ accountStatus: "pending" }, { kycStatus: "pending" }] })
      .select(
        "phone countryCode name email dob gender vehicleType vehicleModel vehicleNumber vehicleColor vehicleYear serviceArea accountStatus kycStatus kycRejectionReason walletBalance aadhaarNumber licenseNumber aadhaarDocument licenseDocument selfieDocument vehicleDocument licenseExpiry createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments({ $or: [{ accountStatus: "pending" }, { kycStatus: "pending" }] }),
  ]);

  sendSuccess(res, "Pending driver approvals fetched", {
    drivers: drivers.map(withKycDocuments),
  }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getDriverKycDetails(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.params.id)
    .select(
      "phone countryCode name email dob gender vehicleType vehicleModel vehicleNumber vehicleColor vehicleYear serviceArea accountStatus kycStatus kycRejectionReason walletBalance aadhaarNumber licenseNumber aadhaarDocument licenseDocument selfieDocument vehicleDocument licenseExpiry createdAt updatedAt",
    )
    .lean();
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  sendSuccess(res, "Driver KYC details fetched", { driver });
}

export async function verifyDriver(req: Request, res: Response): Promise<void> {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "pending" && driver.kycStatus !== "pending") {
    sendError(res, "Only pending drivers can be verified", 400);
    return;
  }

  const balanceBefore = driver.walletBalance;
  driver.accountStatus = "verified";
  driver.kycStatus = "approved";
  driver.kycRejectionReason = undefined;
  driver.isVerified = true;
  driver.isActive = true;

  // Credit the full 3000 sign-up bonus on admin approval.
  // The driver starts with 0 balance after the Google Sign-In flow,
  // so the full bonus is always added here.
  const bonusCredit = env.DRIVER_VERIFICATION_BONUS;
  driver.walletBalance += bonusCredit;
  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount: bonusCredit,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Driver verified by admin — ₹${bonusCredit} sign-up bonus credited`,
    status: "completed",
  });

  sendSuccess(res, "Driver approved and ₹" + bonusCredit + " bonus credited", {
    driverId: driver._id,
    walletBalance: driver.walletBalance,
    accountStatus: driver.accountStatus,
    kycStatus: driver.kycStatus,
  });
}

export async function rejectDriver(req: Request, res: Response): Promise<void> {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "pending" && driver.kycStatus !== "pending") {
    sendError(res, "Only pending drivers can be rejected", 400);
    return;
  }

  driver.accountStatus = "rejected";
  driver.kycStatus = "rejected";
  driver.kycRejectionReason =
    (req.body?.reason as string) ||
    (req.body?.rejectionReason as string) ||
    "KYC rejected by admin";
  driver.isVerified = false;
  await driver.save();

  sendSuccess(res, "Driver verification rejected", {
    driverId: driver._id,
    accountStatus: driver.accountStatus,
    kycStatus: driver.kycStatus,
    rejectionReason: driver.kycRejectionReason,
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
  const rechargeRequest = await RechargeRequest.findOneAndUpdate(
    { _id: requestId, status: "pending" },
    {
      $set: {
        status: "approved",
        reviewedBy: new mongoose.Types.ObjectId(req.user!.id),
        approvedBy: new mongoose.Types.ObjectId(req.user!.id),
        reviewedAt: new Date(),
        approvedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!rechargeRequest) {
    const existing = await RechargeRequest.findById(requestId).lean();
    if (!existing) sendNotFound(res, "Recharge request not found");
    else sendError(res, "Only pending requests can be approved", 400);
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
  rechargeRequest.rejectedBy = new mongoose.Types.ObjectId(req.user!.id);
  rechargeRequest.reviewedAt = new Date();
  rechargeRequest.rejectedAt = new Date();
  rechargeRequest.rejectionReason =
    (req.body?.reason as string) ||
    (req.body?.rejectionReason as string) ||
    "Recharge request rejected by admin";
  await rechargeRequest.save();

  sendSuccess(res, "Recharge request rejected", {
    requestId: rechargeRequest._id,
    status: rechargeRequest.status,
    rejectionReason: rechargeRequest.rejectionReason,
  });
}
