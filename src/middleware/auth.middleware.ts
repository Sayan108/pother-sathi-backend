import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { sendUnauthorized, sendForbidden } from '../utils/response';
import { User } from '../models/User';
import { Driver } from '../models/Driver';

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
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendUnauthorized(res, 'No token provided');
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = { ...payload, _id: payload.id };
    next();
  } catch {
    sendUnauthorized(res, 'Invalid or expired token');
  }
}

/**
 * Restricts access to riders only.
 */
export async function requireRider(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || req.user.role !== 'rider') {
    sendForbidden(res, 'Access restricted to riders');
    return;
  }
  // Verify user still exists and is active
  const user = await User.findById(req.user.id).select('isActive').lean();
  if (!user || !user.isActive) {
    sendForbidden(res, 'Account is inactive or deleted');
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
  next: NextFunction
): Promise<void> {
  if (!req.user || req.user.role !== 'driver') {
    sendForbidden(res, 'Access restricted to drivers');
    return;
  }
  const driver = await Driver.findById(req.user.id).select('isActive accountStatus').lean();
  if (!driver || !driver.isActive) {
    sendForbidden(res, 'Account is inactive or deleted');
    return;
  }
  if (driver.accountStatus === 'suspended') {
    sendForbidden(res, 'Your account has been suspended. Contact support.');
    return;
  }
  next();
}

/**
 * Restricts access to verified drivers only.
 */
export async function requireVerifiedDriver(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || req.user.role !== 'driver') {
    sendForbidden(res, 'Access restricted to drivers');
    return;
  }
  const driver = await Driver.findById(req.user.id)
    .select('isActive accountStatus')
    .lean();
  if (!driver || !driver.isActive) {
    sendForbidden(res, 'Account is inactive or deleted');
    return;
  }
  if (driver.accountStatus !== 'verified') {
    sendForbidden(res, 'Account is pending verification');
    return;
  }
  next();
}

/**
 * Allows both riders and drivers. Just validates the token.
 */
export const authenticateAny = authenticate;
