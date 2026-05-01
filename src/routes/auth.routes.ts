import { Router } from "express";
import {
  sendOTPHandler,
  verifyOTPHandler,
  refreshTokenHandler,
  logoutHandler,
  createAdminAccountHandler,
  adminPasswordLoginHandler,
  socialLoginHandler,
  driverGoogleLoginHandler,
  sendOTPValidation,
  verifyOTPValidation,
  refreshTokenValidation,
  createAdminValidation,
  adminPasswordLoginValidation,
  socialLoginValidation,
  driverGoogleLoginValidation,
} from "../controllers/auth.controller";
import { validateRequest } from "../middleware/validation.middleware";
import { authenticate } from "../middleware/auth.middleware";
import rateLimit from "express-rate-limit";

const router = Router();

// Stricter rate limit for OTP endpoints to prevent brute-force attacks
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10),
  message: {
    success: false,
    message: "Too many OTP requests. Try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// Rate limit for social login endpoints
const socialLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many login attempts. Try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/auth/send-otp
router.post(
  "/send-otp",
  otpLimiter,
  sendOTPValidation,
  validateRequest,
  sendOTPHandler,
);

// POST /api/auth/verify-otp
router.post(
  "/verify-otp",
  otpLimiter,
  verifyOTPValidation,
  validateRequest,
  verifyOTPHandler,
);

// POST /api/auth/social-login  — Rider: Google / Facebook sign-in
router.post(
  "/social-login",
  socialLoginLimiter,
  socialLoginValidation,
  validateRequest,
  socialLoginHandler,
);

// POST /api/auth/driver/google-login  — Driver: Google sign-in (mandatory)
router.post(
  "/driver/google-login",
  socialLoginLimiter,
  driverGoogleLoginValidation,
  validateRequest,
  driverGoogleLoginHandler,
);

// POST /api/auth/admin/register
router.post(
  "/admin/register",
  createAdminValidation,
  validateRequest,
  createAdminAccountHandler,
);

// POST /api/auth/admin/login
router.post(
  "/admin/login",
  adminPasswordLoginValidation,
  validateRequest,
  adminPasswordLoginHandler,
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  refreshTokenValidation,
  validateRequest,
  refreshTokenHandler,
);

// POST /api/auth/logout  (requires valid token)
router.post("/logout", authenticate, logoutHandler);

export default router;
