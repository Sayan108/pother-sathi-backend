import { Request, Response } from "express";
import { body } from "express-validator";
import { User } from "../models/User";
import { Driver } from "../models/Driver";
import { Transaction } from "../models/Transaction";
import { sendOTP, verifyOTP } from "../services/otp.service";
import { verifyToken } from "../services/google-auth.service";
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
  sendForbidden,
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

export const createAdminValidation = [
  body("phone")
    .trim()
    .matches(/^\d{10,15}$/)
    .withMessage("Phone must be 10-15 digits"),
  body("countryCode")
    .optional()
    .matches(/^\+\d{1,4}$/)
    .withMessage("Invalid country code"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters"),
  body("adminSecret").optional().trim(),
];

export const adminPasswordLoginValidation = [
  body("phone")
    .trim()
    .matches(/^\d{10,15}$/)
    .withMessage("Phone must be 10-15 digits"),
  body("countryCode")
    .optional()
    .matches(/^\+\d{1,4}$/)
    .withMessage("Invalid country code"),
  body("password").notEmpty().withMessage("Password is required"),
];

// Social login validation
export const socialLoginValidation = [
  body("idToken").notEmpty().withMessage("ID token is required"),
  body("provider")
    .isIn(["google", "facebook"])
    .withMessage("Provider must be google or facebook"),
  body("deviceId").optional().trim(),
];

export const driverGoogleLoginValidation = [
  body("idToken").notEmpty().withMessage("Google ID token is required"),
  body("deviceId").optional().trim(),
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
 * POST /api/auth/admin/register
 * Creates a new admin account using phone and password.
 */
export async function createAdminAccountHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    phone,
    countryCode = "+91",
    password,
    name,
    adminSecret,
  } = req.body as {
    phone: string;
    countryCode?: string;
    password: string;
    name?: string;
    adminSecret?: string;
  };

  try {
    const existingAdminCount = await User.countDocuments({ role: "admin" });
    if (env.ADMIN_CREATION_KEY) {
      if (!adminSecret || adminSecret !== env.ADMIN_CREATION_KEY) {
        sendUnauthorized(res, "Invalid admin creation secret");
        return;
      }
    } else if (existingAdminCount > 3) {
      sendForbidden(res, "Admin creation is restricted");
      return;
    }

    const existingUser = await User.findByPhone(phone, countryCode);
    if (existingUser) {
      sendError(res, "Account with this phone already exists", 409);
      return;
    }

    const user = await User.create({
      phone,
      countryCode,
      role: "admin",
      password,
      name,
      isVerified: true,
      isActive: true,
    });

    const tokenPayload = {
      id: user._id.toString(),
      phone: user.phone,
      role: "admin" as const,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    sendCreated(res, "Admin account created successfully", {
      accessToken,
      refreshToken,
      role: "admin",
      user: {
        id: user._id.toString(),
        phone: user.phone,
        countryCode: user.countryCode,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("createAdminAccount error:", error);
    sendError(res, (error as Error).message, 503);
  }
}

/**
 * POST /api/auth/admin/login
 * Authenticates an admin using phone and password.
 */
export async function adminPasswordLoginHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    phone,
    countryCode = "+91",
    password,
  } = req.body as {
    phone: string;
    countryCode?: string;
    password: string;
  };

  try {
    const user = await User.findOne({
      phone,
      countryCode,
      role: "admin",
    }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      sendUnauthorized(res, "Invalid credentials");
      return;
    }

    if (!user.isActive) {
      sendForbidden(res, "Account is inactive");
      return;
    }

    const tokenPayload = {
      id: user._id.toString(),
      phone: user.phone,
      role: "admin" as const,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    sendSuccess(res, "Login successful", {
      accessToken,
      refreshToken,
      role: "admin",
      user: {
        id: user._id.toString(),
        phone: user.phone,
        countryCode: user.countryCode,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("adminPasswordLogin error:", error);
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
        // Driver stub — full registration (KYC) happens in /api/driver/register
        // Wallet starts at 0; the 3000 sign-up bonus is credited by admin on approval.
        driver = new Driver({
          phone,
          countryCode,
          accountStatus: "incomplete",
          walletBalance: 0,
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

/**
 * POST /api/auth/social-login
 * Rider social sign-in via Google or Facebook.
 * The mobile client authenticates with the provider and sends the ID token here.
 * Supported providers: "google", "facebook"
 */
export async function socialLoginHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    idToken,
    provider,
    deviceId,
  } = req.body as {
    idToken: string;
    provider: "google" | "facebook";
    deviceId?: string;
  };

  try {
    const identity = await verifyToken(provider, idToken);

    // Prevent device-level fraud: same device → existing account
    if (deviceId) {
      const existingByDevice = await User.findOne({ deviceId, role: "rider" });
      if (existingByDevice) {
        const tokenPayload = {
          id: existingByDevice._id.toString(),
          phone: existingByDevice.phone,
          role: "rider" as const,
        };
        const accessToken = signAccessToken(tokenPayload);
        const refreshToken = signRefreshToken(tokenPayload);
        sendSuccess(res, "Login successful", {
          accessToken,
          refreshToken,
          role: "rider",
          isNewUser: false,
          user: {
            id: existingByDevice._id.toString(),
            name: existingByDevice.name,
            email: existingByDevice.email,
            avatar: existingByDevice.avatar,
            walletBalance: existingByDevice.walletBalance,
          },
        });
        return;
      }
    }

    // Find user by provider ID
    const providerField = provider === "google" ? "googleId" : "facebookId";
    let user = await User.findOne({ [providerField]: identity.providerId });

    let isNewUser = false;

    if (!user) {
      // Try to find by email first to link accounts
      if (identity.email) {
        user = await User.findOne({ email: identity.email, role: "rider" });
      }

      if (user) {
        // Link the social provider to the existing account
        (user as any)[providerField] = identity.providerId;
        if (!user.avatar && identity.picture) user.avatar = identity.picture;
        if (deviceId) user.deviceId = deviceId;
        await user.save();
      } else {
        // Create a new rider account
        const newUser: Record<string, unknown> = {
          // Phone is not available from social login; use email as unique fallback
          // A placeholder phone is generated until user adds their real phone
          phone: `social_${identity.providerId.slice(-10)}`,
          countryCode: "+91",
          role: "rider",
          isVerified: true,
          isActive: true,
          walletBalance: env.NEW_RIDER_WALLET_CREDIT,
          [providerField]: identity.providerId,
        };
        if (identity.name) newUser.name = identity.name;
        if (identity.email) newUser.email = identity.email;
        if (identity.picture) newUser.avatar = identity.picture;
        if (deviceId) newUser.deviceId = deviceId;

        user = await User.create(newUser);
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
      }
    } else {
      // Update device ID if provided
      if (deviceId && user.deviceId !== deviceId) {
        user.deviceId = deviceId;
        await user.save();
      }
    }

    if (!user.isActive) {
      sendForbidden(res, "Account is inactive. Please contact support.");
      return;
    }

    const tokenPayload = {
      id: user._id.toString(),
      phone: user.phone,
      role: "rider" as const,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    const statusCode = isNewUser ? 201 : 200;
    res.status(statusCode).json({
      success: true,
      message: isNewUser ? "Account created successfully" : "Login successful",
      data: {
        accessToken,
        refreshToken,
        role: "rider",
        isNewUser,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          walletBalance: user.walletBalance,
          profileStatus:
            user.name && user.email ? "complete" : "partial",
        },
      },
    });
  } catch (error) {
    logger.error("socialLogin error:", error);
    sendUnauthorized(res, (error as Error).message);
  }
}

/**
 * POST /api/auth/driver/google-login
 * Driver Google Sign-In (mandatory — replaces OTP for drivers).
 * The mobile client authenticates with Google and sends the ID token.
 * After this call the driver must submit KYC via POST /api/driver/register.
 */
export async function driverGoogleLoginHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { idToken, deviceId } = req.body as {
    idToken: string;
    deviceId?: string;
  };

  try {
    const identity = await verifyToken("google", idToken);

    // Device-level fraud check: block same device registering multiple accounts
    if (deviceId) {
      const existingByDevice = await Driver.findOne({ deviceId });
      if (
        existingByDevice &&
        existingByDevice.googleId !== identity.providerId
      ) {
        sendForbidden(
          res,
          "এই ডিভাইস থেকে ইতিমধ্যে একটি ড্রাইভার অ্যাকাউন্ট নিবন্ধিত আছে। দয়া করে পুরনো অ্যাকাউন্টে লগইন করুন।",
        );
        return;
      }
    }

    let driver = await Driver.findOne({ googleId: identity.providerId });
    let isNewDriver = false;

    if (!driver) {
      // Create a stub driver record; full registration happens via /api/driver/register
      driver = await Driver.create({
        // Placeholder phone — driver must link their real number during KYC
        phone: `g_${identity.providerId.slice(-10)}`,
        countryCode: "+91",
        googleId: identity.providerId,
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
        ...(identity.name ? { name: identity.name } : {}),
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.picture ? { avatar: identity.picture } : {}),
        ...(deviceId ? { deviceId } : {}),
      });
      isNewDriver = true;
    } else {
      if (deviceId && driver.deviceId !== deviceId) {
        driver.deviceId = deviceId;
        await driver.save();
      }
    }

    if (!driver.isActive) {
      sendForbidden(res, "Account is inactive. Please contact support.");
      return;
    }
    if ((driver.accountStatus as string) === "suspended") {
      sendForbidden(res, "Your account has been suspended. Contact support.");
      return;
    }

    const tokenPayload = {
      id: driver._id.toString(),
      phone: driver.phone,
      role: "driver" as const,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    const statusCode = isNewDriver ? 201 : 200;
    res.status(statusCode).json({
      success: true,
      message: isNewDriver
        ? "Google login successful. Please complete your KYC to start driving."
        : "Login successful",
      data: {
        accessToken,
        refreshToken,
        role: "driver",
        isNewDriver,
        driver: {
          id: driver._id.toString(),
          name: driver.name,
          email: driver.email,
          avatar: driver.avatar,
          accountStatus: driver.accountStatus,
          walletBalance: driver.walletBalance,
          kycRequired: driver.accountStatus === "incomplete",
        },
      },
    });
  } catch (error) {
    logger.error("driverGoogleLogin error:", error);
    sendUnauthorized(res, (error as Error).message);
  }
}
