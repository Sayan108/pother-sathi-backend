import { Router } from "express";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validation.middleware";
import {
  getRechargeRequests,
  approveRechargeRequest,
  rejectRechargeRequest,
  getPendingDrivers,
  verifyDriver,
  rejectDriver,
  adjustDriverWallet,
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
router.get("/drivers/pending", getPendingDrivers);
router.patch("/drivers/:id/verify", verifyDriver);
router.patch("/drivers/:id/reject", rejectDriver);
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
