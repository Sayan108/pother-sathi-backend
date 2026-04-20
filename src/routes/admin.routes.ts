import { Router } from "express";
import {
  getRechargeRequests,
  approveRechargeRequest,
  rejectRechargeRequest,
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

export default router;
