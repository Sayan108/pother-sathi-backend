import { Request, Response } from "express";
import { body } from "express-validator";
import { Driver, VehicleType, IDriver } from "../models/Driver";
import { Ride } from "../models/Ride";
import { Transaction } from "../models/Transaction";
import { RechargeRequest } from "../models/RechargeRequest";
import { env } from "../config/environment";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendConflict,
} from "../utils/response";
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
  body("licenseNumber")
    .trim()
    .notEmpty()
    .withMessage("Driving licence number is required"),
  body("aadhaarNumber")
    .trim()
    .matches(/^\d{12}$/)
    .withMessage("Aadhaar number must be exactly 12 digits"),
  body("selfieDocument")
    .trim()
    .isURL()
    .withMessage("selfieDocument must be a valid URL"),
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
  body("referralCode")
    .optional()
    .trim()
    .toUpperCase()
    .isAlphanumeric()
    .withMessage("Referral code must be alphanumeric"),
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
 * Performs duplicate Aadhaar / Driving Licence checks before saving.
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
    aadhaarNumber,
    selfieDocument,
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
    licenseNumber: string;
    aadhaarNumber: string;
    selfieDocument: string;
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

  // ── KYC Duplicate Check ─────────────────────────────────────────────────────
  // Check if Aadhaar or Driving Licence is already registered to another driver.
  const [existingAadhaar, existingLicense] = await Promise.all([
    Driver.findOne({
      aadhaarNumber: aadhaarNumber.trim(),
      _id: { $ne: driver._id },
    }).lean(),
    Driver.findOne({
      licenseNumber: licenseNumber.trim().toUpperCase(),
      _id: { $ne: driver._id },
    }).lean(),
  ]);

  if (existingAadhaar) {
    sendError(
      res,
      "আপনার এই পরিচয়পত্রটি (আধার কার্ড) ইতিমধ্যে নিবন্ধিত। পুরনো অ্যাকাউন্টে লগইন করুন।",
      409,
    );
    return;
  }

  if (existingLicense) {
    sendError(
      res,
      "আপনার এই পরিচয়পত্রটি (ড্রাইভিং লাইসেন্স) ইতিমধ্যে নিবন্ধিত। পুরনো অ্যাকাউন্টে লগইন করুন।",
      409,
    );
    return;
  }
  // ────────────────────────────────────────────────────────────────────────────

  driver.name = name;
  driver.vehicleType = vehicleType;
  driver.vehicleModel = vehicleModel;
  driver.vehicleNumber = vehicleNumber.toUpperCase();
  driver.licenseNumber = licenseNumber.trim().toUpperCase();
  driver.aadhaarNumber = aadhaarNumber.trim();
  driver.selfieDocument = selfieDocument;
  if (vehicleColor) driver.vehicleColor = vehicleColor;
  if (vehicleYear) driver.vehicleYear = vehicleYear;
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

  if (req.body.referralCode) {
    const referralCode = (req.body.referralCode as string).toUpperCase();
    const unionLeader = await Driver.findOne({
      referralCode,
      isUnionLeader: true,
      accountStatus: "verified",
    });

    if (!unionLeader) {
      sendError(res, "Invalid referral code", 400);
      return;
    }

    if (!unionLeader._id.equals(driver._id)) {
      driver.referredBy = unionLeader._id;
      unionLeader.walletBalance += env.UNION_LEADER_REFERRAL_BONUS;
      unionLeader.referralCount = (unionLeader.referralCount || 0) + 1;
      await unionLeader.save();
      await Transaction.create({
        userId: unionLeader._id,
        userModel: "Driver",
        type: "referral_bonus",
        amount: env.UNION_LEADER_REFERRAL_BONUS,
        balanceBefore:
          unionLeader.walletBalance - env.UNION_LEADER_REFERRAL_BONUS,
        balanceAfter: unionLeader.walletBalance,
        description: `Referral bonus for ${driver.phone}`,
        status: "completed",
      });
    }
  }

  await driver.save();

  sendSuccess(
    res,
    "KYC submitted successfully. Your application is pending admin review.",
    {
      accountStatus: driver.accountStatus,
      id: driver._id,
      referredBy: driver.referredBy,
    },
  );
}

function hasDriverDocuments(driver: IDriver) {
  return !!(
    driver.name &&
    driver.vehicleType &&
    driver.vehicleModel &&
    driver.vehicleNumber &&
    driver.licenseNumber &&
    driver.licenseDocument &&
    driver.vehicleDocument
  );
}

async function creditDriverVerificationBonus(driver: IDriver) {
  const balanceBefore = driver.walletBalance;
  driver.walletBalance += env.DRIVER_VERIFICATION_BONUS;
  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount: env.DRIVER_VERIFICATION_BONUS,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Driver verification bonus credited to wallet`,
    status: "completed",
  });
}

function generateReferralCode(driverId: string): string {
  const shortId = driverId.slice(-6).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `UL${shortId}${randomSuffix}`;
}

/**
 * POST /api/driver/referral-code
 * Generate or return the driver's union leader referral code.
 */
export async function createReferralCode(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.user!.id);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "verified") {
    sendForbidden(res, "Only verified drivers can become union leaders");
    return;
  }

  if (!driver.referralCode) {
    let code = generateReferralCode(driver._id.toString());
    let exists = await Driver.findOne({ referralCode: code }).lean();
    while (exists) {
      code = generateReferralCode(driver._id.toString());
      exists = await Driver.findOne({ referralCode: code }).lean();
    }
    driver.referralCode = code;
  }

  driver.isUnionLeader = true;
  await driver.save();

  sendSuccess(res, "Referral code created", {
    referralCode: driver.referralCode,
  });
}

/**
 * PATCH /api/driver/activate
 * Activate a pending driver once profile and documents are complete.
 */
export async function activateDriver(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.user!.id);
  if (!driver) {
    sendNotFound(res, "Driver account not found");
    return;
  }

  if (driver.accountStatus === "verified") {
    sendConflict(res, "Driver is already verified");
    return;
  }

  if (driver.accountStatus !== "pending") {
    sendForbidden(res, "Driver account is not ready for activation");
    return;
  }

  if (!hasDriverDocuments(driver)) {
    sendError(
      res,
      "Complete your profile and upload required documents before activation.",
      400,
    );
    return;
  }

  driver.accountStatus = "verified";
  driver.isVerified = true;
  await creditDriverVerificationBonus(driver);
  await driver.save();

  sendSuccess(res, "Driver account activated. You can now go online.", {
    accountStatus: driver.accountStatus,
    walletBalance: driver.walletBalance,
  });
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
 * POST /api/driver/wallet/recharge-request
 * Creates a driver wallet recharge request that must be approved by an admin.
 */
export async function requestWalletRecharge(
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

  const rechargeRequest = await RechargeRequest.create({
    driverId: driver._id,
    amount,
    paymentReference,
    status: "pending",
    description: `Recharge request for ₹${amount}`,
  });

  sendSuccess(res, "Recharge request submitted for approval", {
    requestId: rechargeRequest._id,
    status: rechargeRequest.status,
    amount: rechargeRequest.amount,
    paymentReference: rechargeRequest.paymentReference,
  });
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
