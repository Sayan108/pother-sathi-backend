import { Router } from "express";
import {
  getRide,
  getActiveRide,
  getFareEstimate,
  rateRide,
  rateRideValidation,
} from "../controllers/ride.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validation.middleware";

const router = Router();

// All ride routes require authentication
router.use(authenticate);

// GET /api/rides/fare-estimate  (any authenticated user)
router.get("/fare-estimate", getFareEstimate);

// GET /api/rides/active  (rider or driver)
router.get("/active", getActiveRide);

// POST /api/rides/:rideId/rate  (rider or driver)
router.post("/:rideId/rate", rateRideValidation, validateRequest, rateRide);

// GET /api/rides/:rideId  (rider or driver)
router.get("/:rideId", getRide);

// Ride lifecycle actions (book, accept, arrived, verify-otp, complete, cancel) are handled via sockets.

export default router;
