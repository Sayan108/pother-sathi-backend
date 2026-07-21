import { Router } from "express";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validation.middleware";
import {
  getRechargeRequests,
  approveRechargeRequest,
  rejectRechargeRequest,
  getDrivers,
  getRiders,
  getUnionLeaders,
  getRides,
  getBasePrices,
  createBasePrice,
  updateBasePrice,
  deleteBasePrice,
  getPendingDrivers,
  getDriverKycDetails,
  verifyDriver,
  rejectDriver,
  adjustDriverWallet,
  updateDriverAccount,
  updateRiderAccount,
  deleteDriverAccount,
  deleteRiderAccount,
} from "../controllers/admin.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/driver/wallet/recharge-requests", getRechargeRequests);
router.patch(
  "/driver/wallet/recharge-requests/:id/approve",
  approveRechargeRequest,
);
router.patch(
  "/driver/wallet/recharge-requests/:id/reject",
  rejectRechargeRequest,
);
router.get("/drivers", getDrivers);
router.get("/drivers/pending", getPendingDrivers);
router.get("/drivers/kyc/pending", getPendingDrivers);
router.get("/riders", getRiders);
router.get("/leaders", getUnionLeaders);
router.get("/rides", getRides);
router.get("/base-prices", getBasePrices);
router.get("/fares/base-prices", getBasePrices);
router.post(
  "/base-prices",
  [
    body("vehicleType")
      .isIn(["bike", "auto", "toto", "car", "delivery"])
      .withMessage("Invalid vehicle type"),
    body("basePrice").isFloat({ min: 0 }).withMessage("Base price must be non-negative"),
    body("pricePerKm").isFloat({ min: 0 }).withMessage("Price per km must be non-negative"),
    body("minimumFare").isFloat({ min: 0 }).withMessage("Minimum fare must be non-negative"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  ],
  validateRequest,
  createBasePrice,
);
router.post(
  "/fares/base-prices",
  [
    body("vehicleType")
      .isIn(["bike", "auto", "toto", "car", "delivery"])
      .withMessage("Invalid vehicle type"),
    body("basePrice").isFloat({ min: 0 }).withMessage("Base price must be non-negative"),
    body("pricePerKm").isFloat({ min: 0 }).withMessage("Price per km must be non-negative"),
    body("minimumFare").isFloat({ min: 0 }).withMessage("Minimum fare must be non-negative"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  ],
  validateRequest,
  createBasePrice,
);
router.put(
  "/base-prices/:id",
  [
    body("vehicleType")
      .optional()
      .isIn(["bike", "auto", "toto", "car", "delivery"])
      .withMessage("Invalid vehicle type"),
    body("basePrice").optional().isFloat({ min: 0 }).withMessage("Base price must be non-negative"),
    body("pricePerKm").optional().isFloat({ min: 0 }).withMessage("Price per km must be non-negative"),
    body("minimumFare").optional().isFloat({ min: 0 }).withMessage("Minimum fare must be non-negative"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  ],
  validateRequest,
  updateBasePrice,
);
router.put(
  "/fares/base-prices/:id",
  [
    body("vehicleType")
      .optional()
      .isIn(["bike", "auto", "toto", "car", "delivery"])
      .withMessage("Invalid vehicle type"),
    body("basePrice").optional().isFloat({ min: 0 }).withMessage("Base price must be non-negative"),
    body("pricePerKm").optional().isFloat({ min: 0 }).withMessage("Price per km must be non-negative"),
    body("minimumFare").optional().isFloat({ min: 0 }).withMessage("Minimum fare must be non-negative"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  ],
  validateRequest,
  updateBasePrice,
);
router.delete("/base-prices/:id", deleteBasePrice);
router.delete("/fares/base-prices/:id", deleteBasePrice);
router.get("/drivers/:id/kyc", getDriverKycDetails);
router.patch("/drivers/:id/verify", verifyDriver);
router.patch("/drivers/:id/kyc/approve", verifyDriver);
router.patch("/drivers/:id/reject", rejectDriver);
router.patch("/drivers/:id/kyc/reject", rejectDriver);
router.patch("/drivers/:id", updateDriverAccount);
router.put("/drivers/:id", updateDriverAccount);
router.delete("/drivers/:id", deleteDriverAccount);
router.patch("/riders/:id", updateRiderAccount);
router.put("/riders/:id", updateRiderAccount);
router.delete("/riders/:id", deleteRiderAccount);
router.patch(
  "/drivers/:id/wallet",
  [
    body("action")
      .isIn(["credit", "debit", "set"])
      .withMessage("Action must be credit, debit, or set"),
    body("amount")
      .isFloat({ min: 0 })
      .withMessage("Amount must be a non-negative number"),
  ],
  validateRequest,
  adjustDriverWallet,
);

export default router;
