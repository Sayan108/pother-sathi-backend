import { Request, Response } from "express";
import { body } from "express-validator";
import { Driver, VehicleType } from "../models/Driver";
import { Ride } from "../models/Ride";
import { Transaction } from "../models/Transaction";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendConflict,
} from "../utils/response";
import { env } from "../config/environment";
import { logger } from "../utils/logger";

// ─── Validation ───────────────────────────────────────────────────────────────

export const registerDriverValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name is required"),
  body("vehicleType")
    .isIn(["bike", "auto", "toto", "car", "delivery"])
    .withMessage("Invalid vehicle type"),
  body("vehicleModel")
    .trim()
    .notEmpty()
    .withMessage("Vehicle model is required"),
  body("vehicleNumber")
    .trim()
    .notEmpty()
    .withMessage("Vehicle number is required"),
  body("licenseNumber").optional().trim(),
  body("licenseExpiry")
    .optional()
    .isISO8601()
    .withMessage("Invalid license expiry date"),
  body("serviceArea").optional().trim(),
  body("email").optional().trim().isEmail().normalizeEmail(),
  body("gender").optional().isIn(["male", "female", "other"]),
  body("nidNumber").optional().trim(),
  body("nidDocument")
    .optional()
    .trim()
    .isURL()
    .withMessage("nidDocument must be a valid URL"),
  body("licenseDocument")
    .optional()
    .trim()
    .isURL()
    .withMessage("licenseDocument must be a valid URL"),
  body("vehicleDocument")
    .optional()
    .trim()
    .isURL()
    .withMessage("vehicleDocument must be a valid URL"),
];

export const locationUpdateValidation = [
  body("lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
  body("lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
];

export const rechargeWalletValidation = [
  body("amount")
    .isFloat({ min: 10, max: 10000 })
    .withMessage("Amount must be between 10 and 10000"),
  body("paymentReference").optional().trim(),
];

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/driver/register
 * Complete driver registration (multi-step form submission).
 */
export async function registerDriver(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.user!.id);
  if (!driver) {
    sendNotFound(res, "Driver account not found");
    return;
  }

  if (driver.accountStatus === "verified") {
    sendConflict(res, "Driver is already registered and verified");
    return;
  }

  const {
    name,
    vehicleType,
    vehicleModel,
    vehicleNumber,
    vehicleColor,
    vehicleYear,
    licenseNumber,
    serviceArea,
    email,
    gender,
    dob,
    nidNumber,
    nidDocument,
    licenseDocument,
    vehicleDocument,
    licenseExpiry,
    avatar,
  } = req.body as {
    name: string;
    vehicleType: VehicleType;
    vehicleModel: string;
    vehicleNumber: string;
    vehicleColor?: string;
    vehicleYear?: string;
    licenseNumber?: string;
    serviceArea?: string;
    email?: string;
    gender?: string;
    dob?: Date;
    nidNumber?: string;
    nidDocument?: string;
    licenseDocument?: string;
    vehicleDocument?: string;
    licenseExpiry?: string;
    avatar?: string;
  };

  driver.name = name;
  driver.vehicleType = vehicleType;
  driver.vehicleModel = vehicleModel;
  driver.vehicleNumber = vehicleNumber.toUpperCase();
  if (vehicleColor) driver.vehicleColor = vehicleColor;
  if (vehicleYear) driver.vehicleYear = vehicleYear;
  if (licenseNumber) driver.licenseNumber = licenseNumber;
  if (serviceArea) driver.serviceArea = serviceArea;
  if (email) driver.email = email;
  if (gender) driver.gender = gender as "male" | "female" | "other";
  if (dob) driver.dob = new Date(dob);
  if (nidNumber) driver.nidNumber = nidNumber;
  if (nidDocument) driver.nidDocument = nidDocument;
  if (licenseDocument) driver.licenseDocument = licenseDocument;
  if (vehicleDocument) driver.vehicleDocument = vehicleDocument;
  if (licenseExpiry) driver.licenseExpiry = new Date(licenseExpiry);
  if (avatar) driver.avatar = avatar;
  driver.accountStatus = "pending";

  await driver.save();

  sendSuccess(
    res,
    "Registration submitted. Your account is pending verification.",
    {
      accountStatus: driver.accountStatus,
      id: driver._id,
    },
  );
}

/**
 * GET /api/driver/profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const driver = await Driver.findById(req.user!.id)
    .select("-fcmToken -socketId")
    .lean();
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  sendSuccess(res, "Profile fetched", driver);
}

/**
 * PUT /api/driver/profile
 */
export async function updateProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const allowedFields = [
    "name",
    "email",
    "gender",
    "dob",
    "avatar",
    "serviceArea",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  const driver = await Driver.findByIdAndUpdate(
    req.user!.id,
    { $set: updates },
    { new: true, runValidators: true },
  ).select("-fcmToken -socketId");

  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  sendSuccess(res, "Profile updated", driver);
}

/**
 * PATCH /api/driver/online-status
 * Toggle driver online/offline.
 */
export async function toggleOnlineStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const { isOnline } = req.body as { isOnline: boolean };
  const driver = await Driver.findById(req.user!.id);

  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "verified") {
    sendForbidden(res, "Your account must be verified before going online");
    return;
  }
  if (isOnline && driver.walletBalance < env.DRIVER_MIN_WALLET_BALANCE) {
    sendError(
      res,
      `Minimum wallet balance of ₹${env.DRIVER_MIN_WALLET_BALANCE} required to go online`,
      400,
    );
    return;
  }

  driver.isOnline = isOnline;
  driver.isAvailable = isOnline; // Available when online and no active ride
  await driver.save();

  sendSuccess(res, `You are now ${isOnline ? "online" : "offline"}`, {
    isOnline: driver.isOnline,
    isAvailable: driver.isAvailable,
  });
}

/**
 * PATCH /api/driver/location
 * Update driver's real-time GPS location.
 */
export async function updateLocation(
  req: Request,
  res: Response,
): Promise<void> {
  const { lat, lng } = req.body as { lat: number; lng: number };

  await Driver.findByIdAndUpdate(req.user!.id, {
    $set: {
      "location.coordinates": [lng, lat],
    },
  });

  sendSuccess(res, "Location updated");
}

/**
 * GET /api/driver/rides
 */
export async function getRideHistory(
  req: Request,
  res: Response,
): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const skip = (page - 1) * limit;

  const [rides, total] = await Promise.all([
    Ride.find({ driverId: req.user!.id, status: "completed" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("riderId", "name phone avatar rating")
      .lean(),
    Ride.countDocuments({ driverId: req.user!.id, status: "completed" }),
  ]);

  sendSuccess(res, "Ride history fetched", rides, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * GET /api/driver/wallet
 * Returns wallet balance and transaction history.
 */
export async function getWallet(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  const driver = await Driver.findById(req.user!.id)
    .select("walletBalance totalEarnings")
    .lean();
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  const [transactions, total] = await Promise.all([
    Transaction.find({ userId: req.user!.id, userModel: "Driver" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments({ userId: req.user!.id, userModel: "Driver" }),
  ]);

  sendSuccess(
    res,
    "Wallet details fetched",
    {
      walletBalance: driver.walletBalance,
      totalEarnings: driver.totalEarnings,
      transactions,
    },
    200,
    { page, limit, total, totalPages: Math.ceil(total / limit) },
  );
}

/**
 * POST /api/driver/wallet/recharge
 * Recharge driver wallet (mock payment — in production, integrate a payment gateway).
 */
export async function rechargeWallet(
  req: Request,
  res: Response,
): Promise<void> {
  const { amount, paymentReference } = req.body as {
    amount: number;
    paymentReference?: string;
  };

  const driver = await Driver.findById(req.user!.id);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  const balanceBefore = driver.walletBalance;
  driver.walletBalance += amount;
  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Wallet recharged with ₹${amount}`,
    status: "completed",
    reference: paymentReference,
  });

  sendSuccess(res, `Wallet recharged with ₹${amount}`, {
    walletBalance: driver.walletBalance,
  });
}

/**
 * PUT /api/driver/fcm-token
 */
export async function updateFcmToken(
  req: Request,
  res: Response,
): Promise<void> {
  const { fcmToken } = req.body as { fcmToken: string };
  if (!fcmToken) {
    sendError(res, "fcmToken is required", 400);
    return;
  }
  await Driver.findByIdAndUpdate(req.user!.id, { $set: { fcmToken } });
  sendSuccess(res, "FCM token updated");
}
