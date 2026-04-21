import { Request, Response } from "express";
import { body } from "express-validator";
import { User } from "../models/User";
import { Driver } from "../models/Driver";
import { Transaction } from "../models/Transaction";
import { sendOTP, verifyOTP } from "../services/otp.service";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { env } from "../config/environment";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendUnauthorized,
  sendNotFound,
} from "../utils/response";
import { logger } from "../utils/logger";

// ─── Validation Rules ─────────────────────────────────────────────────────────

export const sendOTPValidation = [
  body("phone")
    .trim()
    .matches(/^\d{10,15}$/)
    .withMessage("Phone must be 10-15 digits"),
  body("countryCode")
    .optional()
    .matches(/^\+\d{1,4}$/)
    .withMessage("Invalid country code"),
  body("role")
    .isIn(["rider", "driver"])
    .withMessage("Role must be rider or driver"),
];

export const verifyOTPValidation = [
  body("phone")
    .trim()
    .matches(/^\d{10,15}$/)
    .withMessage("Invalid phone"),
  body("countryCode")
    .optional()
    .matches(/^\+\d{1,4}$/),
  body("otp")
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be exactly 6 digits"),
  body("role").isIn(["rider", "driver"]).withMessage("Invalid role"),
];

export const refreshTokenValidation = [
  body("refreshToken").notEmpty().withMessage("Refresh token required"),
];

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/send-otp
 * Sends an OTP to the given phone number.
 */
export async function sendOTPHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    phone,
    countryCode = "+91",
    role,
  } = req.body as {
    phone: string;
    countryCode?: string;
    role: "rider" | "driver";
  };

  try {
    const result = await sendOTP(phone, countryCode, role, "login");
    sendSuccess(res, result.message, {
      ...(result.otp && { otp: result.otp }), // Only in demo mode
      phone,
      countryCode,
    });
  } catch (error) {
    logger.error("sendOTP error:", error);
    sendError(res, (error as Error).message, 503);
  }
}

/**
 * POST /api/auth/verify-otp
 * Verifies OTP and returns JWT tokens. Creates user/driver if new.
 */
export async function verifyOTPHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    phone,
    countryCode = "+91",
    otp,
    role,
  } = req.body as {
    phone: string;
    countryCode?: string;
    otp: string;
    role: "rider" | "driver";
  };

  try {
    const result = await verifyOTP(phone, countryCode, otp, role);
    if (!result.success) {
      sendError(res, result.message, 400);
      return;
    }

    let userId: string;
    let isNewUser = false;
    let userData: Record<string, unknown> = {};

    if (role === "rider") {
      let user = await User.findByPhone(phone, countryCode);
      if (!user) {
        user = await User.create({
          phone,
          countryCode,
          role: "rider",
          isVerified: true,
          walletBalance: env.NEW_RIDER_WALLET_CREDIT,
        });
        await Transaction.create({
          userId: user._id,
          userModel: "User",
          type: "wallet_recharge",
          amount: env.NEW_RIDER_WALLET_CREDIT,
          balanceBefore: 0,
          balanceAfter: env.NEW_RIDER_WALLET_CREDIT,
          description: "Welcome bonus credit for new rider account",
          status: "completed",
        });
        isNewUser = true;
      } else if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }
      userId = user._id.toString();
      const isRiderProfileComplete = !!(user.name && user.email);
      userData = {
        id: userId,
        phone: user.phone,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        rating: user.rating,
        walletBalance: user.walletBalance,
        profileStatus: isRiderProfileComplete ? "complete" : "partial",
      };
    } else {
      let driver = await Driver.findByPhone(phone, countryCode);
      if (!driver) {
        // Driver stub — full registration happens in /api/driver/register
        driver = new Driver({
          phone,
          countryCode,
          accountStatus: "incomplete",
        });
        try {
          await driver.save({ validateBeforeSave: false });
        } catch (saveError) {
          if ((saveError as any)?.name === "ValidationError") {
            const insertResult = await Driver.collection.insertOne({
              phone,
              countryCode,
              accountStatus: "incomplete",
              isVerified: false,
              isActive: true,
              isOnline: false,
              isAvailable: false,
              walletBalance: 0,
              totalEarnings: 0,
              rating: 5.0,
              totalRatings: 0,
              totalRides: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);
            driver = await Driver.findById(insertResult.insertedId);
            if (!driver) throw saveError;
          } else {
            throw saveError;
          }
        }
        isNewUser = true;
      } else if (!driver.isVerified) {
        driver.accountStatus = "pending";
        await driver.save({ validateBeforeSave: false });
      }
      userId = driver._id.toString();
      const isProfileComplete = !!(
        driver.name &&
        driver.vehicleModel &&
        driver.vehicleNumber
      );
      userData = {
        id: userId,
        phone: driver.phone,
        name: driver.name,
        avatar: driver.avatar,
        accountStatus: driver.accountStatus,
        walletBalance: driver.walletBalance,
        profileStatus: isProfileComplete ? "complete" : "partial",
        isRegistered: isProfileComplete,
      };
    }

    const tokenPayload = { id: userId, phone, role };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    const statusCode = isNewUser ? 201 : 200;
    res.status(statusCode).json({
      success: true,
      message: isNewUser ? "Account created successfully" : "Login successful",
      data: {
        accessToken,
        refreshToken,
        role,
        isNewUser,
        walletBalance: userData.walletBalance,
        user: userData,
      },
    });
  } catch (error) {
    logger.error("verifyOTP error:", error);
    sendError(res, (error as Error).message, 503);
  }
}

/**
 * POST /api/auth/refresh
 * Issues a new access token using a valid refresh token.
 */
export async function refreshTokenHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };

  try {
    const payload = verifyRefreshToken(refreshToken);

    // Verify the user/driver still exists
    let exists = false;
    if (payload.role === "rider") {
      exists = !!(await User.findById(payload.id)
        .select("_id isActive")
        .lean());
    } else {
      exists = !!(await Driver.findById(payload.id)
        .select("_id isActive")
        .lean());
    }

    if (!exists) {
      sendUnauthorized(res, "Account not found");
      return;
    }

    const newAccessToken = signAccessToken({
      id: payload.id,
      phone: payload.phone,
      role: payload.role,
    });

    sendSuccess(res, "Token refreshed", { accessToken: newAccessToken });
  } catch {
    sendUnauthorized(res, "Invalid or expired refresh token");
  }
}

/**
 * POST /api/auth/logout
 * Client-side logout — instructs client to discard tokens.
 * In a production app with token blocklist: add token to a Redis blocklist here.
 */
export async function logoutHandler(
  req: Request,
  res: Response,
): Promise<void> {
  // Stateless JWT — client discards tokens.
  // TODO: Add token to Redis blocklist for true server-side invalidation.
  sendSuccess(res, "Logged out successfully");
}
