import { Router } from "express";
import {
  getRide,
  getActiveRide,
  getFareEstimate,
} from "../controllers/ride.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All ride routes require authentication
router.use(authenticate);

// GET /api/rides/fare-estimate  (any authenticated user)
router.get("/fare-estimate", getFareEstimate);

// GET /api/rides/active  (rider or driver)
router.get("/active", getActiveRide);

// GET /api/rides/:rideId  (rider or driver)
router.get("/:rideId", getRide);

// All ride POST actions (book, accept, arrived, verify-otp, complete, cancel) are now handled via sockets.
// Only GET endpoints remain as HTTP.

export default router;

