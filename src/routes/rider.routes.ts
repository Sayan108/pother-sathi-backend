import { Router } from "express";
import {
  getProfile,
  updateProfile,
  getRideHistory,
  getRideById,
  getWallet,
  updateFcmToken,
  updateProfileValidation,
} from "../controllers/rider.controller";
import { authenticate, requireRider } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validation.middleware";
import { body } from "express-validator";

const router = Router();

// All rider routes require authentication + rider role
router.use(authenticate, requireRider);

// GET  /api/rider/profile
router.get("/profile", getProfile);

// PUT  /api/rider/profile
router.put("/profile", updateProfileValidation, validateRequest, updateProfile);

// GET  /api/rider/rides
router.get("/rides", getRideHistory);

// GET  /api/rider/wallet
router.get("/wallet", getWallet);

// GET  /api/rider/rides/:rideId
router.get("/rides/:rideId", getRideById);

// PUT  /api/rider/fcm-token
router.put(
  "/fcm-token",
  [body("fcmToken").notEmpty().withMessage("fcmToken required")],
  validateRequest,
  updateFcmToken,
);

export default router;
