import { Router } from "express";
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
} from "../controllers/ride.controller";
import {
  authenticate,
  requireRider,
  requireVerifiedDriver,
} from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validation.middleware";
import { body } from "express-validator";

const router = Router();

// All ride routes require authentication
router.use(authenticate);

// GET /api/rides/fare-estimate  (any authenticated user)
router.get("/fare-estimate", getFareEstimate);

// GET /api/rides/active  (rider or driver)
router.get("/active", getActiveRide);

// GET /api/rides/:rideId  (rider or driver)
router.get("/:rideId", getRide);

// ── Rider-only routes ──────────────────────────────────────────────────────────

// All ride POST actions (book, accept, arrived, verify-otp, complete, cancel) are now handled via sockets.
// Only GET endpoints and rating remain as HTTP.

export default router;
