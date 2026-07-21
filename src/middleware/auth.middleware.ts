import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../utils/jwt";
import { sendUnauthorized, sendForbidden } from "../utils/response";
import { User } from "../models/User";
import { Driver } from "../models/Driver";

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload & { _id: string };
    }
  }
}

/**
 * Verifies the JWT access token from Authorization header.
 * Attaches decoded payload to req.user.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendUnauthorized(res, "No token provided");
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = { ...payload, _id: payload.id };
    next();
  } catch {
    sendUnauthorized(res, "Invalid or expired token");
  }
}

/**
 * Restricts access to riders only.
 */
export async function requireRider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user || req.user.role !== "rider") {
    sendForbidden(res, "Access restricted to riders");
    return;
  }
  // Verify user still exists and is active
  const user = await User.findById(req.user.id).select("isActive accountStatus isDeleted").lean();
  if (!user || !user.isActive || user.isDeleted || user.accountStatus === "banned") {
    sendForbidden(res, "Account is inactive or deleted");
    return;
  }
  next();
}

/**
 * Restricts access to drivers only.
 */
export async function requireDriver(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user || req.user.role !== "driver") {
    sendForbidden(res, "Access restricted to drivers");
    return;
  }
  const driver = await Driver.findById(req.user.id)
    .select("isActive accountStatus")
    .lean();
  if (!driver || !driver.isActive || driver.accountStatus === "banned") {
    sendForbidden(res, "Account is inactive or deleted");
    return;
  }
  if (driver.accountStatus === "suspended") {
    sendForbidden(res, "Your account has been suspended. Contact support.");
    return;
  }
  next();
}

export function isDriverKycApproved(driver: {
  accountStatus?: string;
  kycStatus?: string;
}): boolean {
  return (
    driver.kycStatus === "approved" ||
    driver.accountStatus === "verified" ||
    driver.accountStatus === "approved"
  );
}

export async function loadApprovedDriver(driverId: string) {
  const driver = await Driver.findById(driverId);
  if (!driver || !driver.isActive || driver.accountStatus === "suspended" || driver.accountStatus === "banned") {
    return null;
  }
  return isDriverKycApproved(driver) ? driver : null;
}

/**
 * Restricts access to verified drivers only.
 */
export async function requireVerifiedDriver(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user || req.user.role !== "driver") {
    sendForbidden(res, "Access restricted to drivers");
    return;
  }
  const driver = await Driver.findById(req.user.id)
    .select("isActive accountStatus")
    .lean();
  if (!driver || !driver.isActive || driver.accountStatus === "banned") {
    sendForbidden(res, "Account is inactive or deleted");
    return;
  }
  if (!isDriverKycApproved(driver)) {
    sendForbidden(res, "Driver KYC approval required");
    return;
  }
  next();
}

export const requireApprovedDriver = requireVerifiedDriver;

/**
 * Allows both riders and drivers. Just validates the token.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user || req.user.role !== "admin") {
    sendForbidden(res, "Access restricted to admins");
    return;
  }

  const user = await User.findById(req.user.id).select("isActive role").lean();
  if (!user || !user.isActive || user.role !== "admin") {
    sendForbidden(res, "Admin access required");
    return;
  }

  next();
}

export const authenticateAny = authenticate;
