import crypto from "crypto";
import { Request, Response } from "express";
import { IUser, User } from "../models/User";
import { Transaction } from "../models/Transaction";
import { env } from "../config/environment";
import { signAccessToken, signRefreshToken } from "../utils/jwt";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendUnauthorized,
  sendForbidden,
} from "../utils/response";
import { logger } from "../utils/logger";
import {
  buildGoogleOAuthUrl,
  exchangeCodeForGoogleIdentity,
} from "../services/google-oauth.service";

const STATE_COOKIE_NAME = "google_oauth_state";
const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SOCIAL_PHONE_PREFIX = "s";

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join("=") || "");
  }
  return cookies;
}

function createPhonePlaceholder(providerId: string): string {
  const hash = crypto.createHash("sha256").update(providerId).digest("hex");
  const numeric = hash
    .split("")
    .map((char) => (parseInt(char, 16) % 10).toString())
    .join("");
  return numeric.slice(0, 10).padStart(10, "0");
}

function buildAuthResponse(user: IUser, isNewUser: boolean) {
  return {
    accessToken: signAccessToken({
      id: user._id.toString(),
      phone: user.phone,
      role: "rider" as const,
    }),
    refreshToken: signRefreshToken({
      id: user._id.toString(),
      phone: user.phone,
      role: "rider" as const,
    }),
    role: "rider",
    isNewUser,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      walletBalance: user.walletBalance,
      profileStatus: user.name && user.email ? "complete" : "partial",
    },
  };
}

export async function getGoogleOAuthHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const state = crypto.randomBytes(24).toString("hex");
    const authUrl = buildGoogleOAuthUrl(state);

    res.cookie(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: STATE_TTL_MS,
      path: "/",
    });
    res.redirect(authUrl);
  } catch (error) {
    logger.error("getGoogleOAuthHandler error:", error);
    sendError(res, (error as Error).message, 500);
  }
}

export async function googleOAuthCallbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    sendError(res, "Missing authorization code or state", 400);
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies[STATE_COOKIE_NAME];
  if (!expectedState || expectedState !== state) {
    sendUnauthorized(res, "Invalid or missing OAuth state");
    return;
  }

  res.clearCookie(STATE_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  try {
    const identity = await exchangeCodeForGoogleIdentity(code);
    if (!identity.email) {
      sendError(res, "Google account did not provide an email address", 400);
      return;
    }

    let user = await User.findOne({
      googleId: identity.providerId,
      role: "rider",
    });
    let isNewUser = false;

    if (!user) {
      user = await User.findOne({ email: identity.email, role: "rider" });
      if (user) {
        user.googleId = identity.providerId;
        if (!user.avatar && identity.picture) user.avatar = identity.picture;
        if (!user.name && identity.name) user.name = identity.name;
        await user.save();
      }
    }

    if (!user) {
      user = await User.create({
        phone: createPhonePlaceholder(identity.providerId),
        countryCode: "+91",
        role: "rider",
        isVerified: true,
        isActive: true,
        walletBalance: env.NEW_RIDER_WALLET_CREDIT,
        googleId: identity.providerId,
        email: identity.email,
        name: identity.name,
        avatar: identity.picture,
      });
      await Transaction.create({
        userId: user._id,
        userModel: "User",
        type: "wallet_recharge",
        amount: env.NEW_RIDER_WALLET_CREDIT,
        balanceBefore: 0,
        balanceAfter: env.NEW_RIDER_WALLET_CREDIT,
        description: "Welcome bonus credit for new rider account",
        status: "completed",
      });
      isNewUser = true;
    }

    if (!user.isActive) {
      sendForbidden(res, "Account is inactive. Please contact support.");
      return;
    }

    const responseBody = buildAuthResponse(user, isNewUser);
    const statusCode = isNewUser ? 201 : 200;
    if (statusCode === 201) {
      sendCreated(res, "Account created successfully", responseBody);
    } else {
      sendSuccess(res, "Login successful", responseBody);
    }
  } catch (error) {
    logger.error("googleOAuthCallbackHandler error:", error);
    sendUnauthorized(res, (error as Error).message);
  }
}
