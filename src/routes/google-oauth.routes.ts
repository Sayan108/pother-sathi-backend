import { Router } from "express";
import {
  getGoogleOAuthHandler,
  googleOAuthCallbackHandler,
} from "../controllers/google-auth.controller";

const router = Router();

router.get("/google", getGoogleOAuthHandler);
router.get("/google/callback", googleOAuthCallbackHandler);

export default router;
