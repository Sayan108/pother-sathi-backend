import { Request, Response } from 'express';
import { body } from 'express-validator';
import { User } from '../models/User';
import { Ride } from '../models/Ride';
import { Transaction } from '../models/Transaction';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendForbidden,
} from '../utils/response';

// ─── Validation ───────────────────────────────────────────────────────────────

export const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('dob').optional().isISO8601().toDate(),
];

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/rider/profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.user!.id).select('-fcmToken').lean();
  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }
  sendSuccess(res, 'Profile fetched', user);
}

/**
 * PUT /api/rider/profile
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { name, email, gender, dob, avatar } = req.body as {
    name?: string;
    email?: string;
    gender?: 'male' | 'female' | 'other';
    dob?: Date;
    avatar?: string;
  };

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { name, email, gender, dob, avatar } },
    { new: true, runValidators: true }
  ).select('-fcmToken');

  if (!user) {
    sendNotFound(res, 'User not found');
    return;
  }
  sendSuccess(res, 'Profile updated', user);
}

/**
 * GET /api/rider/rides
 * Paginated ride history for the rider.
 */
export async function getRideHistory(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const skip = (page - 1) * limit;

  const [rides, total] = await Promise.all([
    Ride.find({ riderId: req.user!.id, status: 'completed' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('driverId', 'name phone avatar vehicleType vehicleNumber rating')
      .lean(),
    Ride.countDocuments({ riderId: req.user!.id, status: 'completed' }),
  ]);

  sendSuccess(res, 'Ride history fetched', rides, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * GET /api/rider/rides/:rideId
 */
export async function getRideById(req: Request, res: Response): Promise<void> {
  const ride = await Ride.findOne({
    _id: req.params.rideId,
    riderId: req.user!.id,
  })
    .populate('driverId', 'name phone avatar vehicleType vehicleNumber rating')
    .lean();

  if (!ride) {
    sendNotFound(res, 'Ride not found');
    return;
  }
  sendSuccess(res, 'Ride details fetched', ride);
}

/**
 * PUT /api/rider/fcm-token
 */
export async function updateFcmToken(req: Request, res: Response): Promise<void> {
  const { fcmToken } = req.body as { fcmToken: string };
  if (!fcmToken) {
    sendError(res, 'fcmToken is required', 400);
    return;
  }
  await User.findByIdAndUpdate(req.user!.id, { $set: { fcmToken } });
  sendSuccess(res, 'FCM token updated');
}
