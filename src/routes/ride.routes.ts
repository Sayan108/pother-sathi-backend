import { Router } from 'express';
import {
  bookRide,
  getRide,
  acceptRide,
  driverArrived,
  verifyRideOTP,
  completeRide,
  cancelRide,
  rateRide,
  getActiveRide,
  getFareEstimate,
  bookRideValidation,
  rateRideValidation,
  cancelRideValidation,
} from '../controllers/ride.controller';
import {
  authenticate,
  requireRider,
  requireVerifiedDriver,
} from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { body } from 'express-validator';

const router = Router();

// All ride routes require authentication
router.use(authenticate);

// GET /api/rides/fare-estimate  (any authenticated user)
router.get('/fare-estimate', getFareEstimate);

// GET /api/rides/active  (rider or driver)
router.get('/active', getActiveRide);

// GET /api/rides/:rideId  (rider or driver)
router.get('/:rideId', getRide);

// ── Rider-only routes ──────────────────────────────────────────────────────────

// POST /api/rides/book
router.post('/book', requireRider, bookRideValidation, validateRequest, bookRide);

// POST /api/rides/:rideId/cancel  (rider)
router.post(
  '/:rideId/cancel',
  cancelRideValidation,
  validateRequest,
  cancelRide
);

// POST /api/rides/:rideId/rate
router.post('/:rideId/rate', rateRideValidation, validateRequest, rateRide);

// ── Driver-only routes ─────────────────────────────────────────────────────────

// POST /api/rides/:rideId/accept
router.post('/:rideId/accept', requireVerifiedDriver, acceptRide);

// POST /api/rides/:rideId/arrived
router.post('/:rideId/arrived', requireVerifiedDriver, driverArrived);

// POST /api/rides/:rideId/verify-otp
router.post(
  '/:rideId/verify-otp',
  requireVerifiedDriver,
  [body('otp').isLength({ min: 4, max: 4 }).withMessage('OTP must be 4 digits')],
  validateRequest,
  verifyRideOTP
);

// POST /api/rides/:rideId/complete
router.post('/:rideId/complete', requireVerifiedDriver, completeRide);

export default router;
