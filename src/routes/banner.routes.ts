import { Router } from "express";
import { getActiveUserBanners } from "../controllers/banner.controller";

const router = Router();

router.get("/user", getActiveUserBanners);

export default router;
