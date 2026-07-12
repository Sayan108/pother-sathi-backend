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

const router = Router();

// POST /api/auth/send-otp
router.post(
  "/send-otp",
  sendOTPValidation,
  validateRequest,
  sendOTPHandler,
);

// POST /api/auth/verify-otp
router.post(
  "/verify-otp",
  verifyOTPValidation,
  validateRequest,
  verifyOTPHandler,
);

// POST /api/auth/social-login  — Rider: Google / Facebook sign-in
router.post(
  "/social-login",
  socialLoginValidation,
  validateRequest,
  socialLoginHandler,
);

// POST /api/auth/driver/google-login  — Driver: Google sign-in (mandatory)
router.post(
  "/driver/google-login",
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
