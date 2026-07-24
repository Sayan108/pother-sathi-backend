import { Router } from "express";
import {
  getActiveDriverBanners,
  getActiveUserBanners,
} from "../controllers/banner.controller";

const router = Router();

router.get("/user", getActiveUserBanners);
router.get("/driver", getActiveDriverBanners);

export default router;
