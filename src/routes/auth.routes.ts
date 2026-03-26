import { Router } from 'express';
import {
  sendOTPHandler,
  verifyOTPHandler,
  refreshTokenHandler,
  logoutHandler,
  sendOTPValidation,
  verifyOTPValidation,
  refreshTokenValidation,
} from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { authenticate } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Stricter rate limit for OTP endpoints to prevent abuse
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, sendOTPValidation, validateRequest, sendOTPHandler);

// POST /api/auth/verify-otp
router.post('/verify-otp', otpLimiter, verifyOTPValidation, validateRequest, verifyOTPHandler);

// POST /api/auth/refresh
router.post('/refresh', refreshTokenValidation, validateRequest, refreshTokenHandler);

// POST /api/auth/logout  (requires valid token)
router.post('/logout', authenticate, logoutHandler);

export default router;
