import { Router } from 'express';
import {
  registerDriver,
  getProfile,
  updateProfile,
  toggleOnlineStatus,
  updateLocation,
  getRideHistory,
  getWallet,
  rechargeWallet,
  updateFcmToken,
  registerDriverValidation,
  locationUpdateValidation,
  rechargeWalletValidation,
} from '../controllers/driver.controller';
import {
  authenticate,
  requireDriver,
  requireVerifiedDriver,
} from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { body } from 'express-validator';

const router = Router();

// All driver routes require authentication + driver role
router.use(authenticate, requireDriver);

// POST /api/driver/register   (any driver can complete their profile)
router.post('/register', registerDriverValidation, validateRequest, registerDriver);

// GET  /api/driver/profile
router.get('/profile', getProfile);

// PUT  /api/driver/profile
router.put('/profile', validateRequest, updateProfile);

// Below routes require verified driver account:

// PATCH /api/driver/online-status
router.patch(
  '/online-status',
  requireVerifiedDriver,
  [body('isOnline').isBoolean().withMessage('isOnline must be boolean')],
  validateRequest,
  toggleOnlineStatus
);

// PATCH /api/driver/location
router.patch(
  '/location',
  requireVerifiedDriver,
  locationUpdateValidation,
  validateRequest,
  updateLocation
);

// GET  /api/driver/rides
router.get('/rides', getRideHistory);

// GET  /api/driver/wallet
router.get('/wallet', getWallet);

// POST /api/driver/wallet/recharge
router.post(
  '/wallet/recharge',
  rechargeWalletValidation,
  validateRequest,
  rechargeWallet
);

// PUT  /api/driver/fcm-token
router.put(
  '/fcm-token',
  [body('fcmToken').notEmpty()],
  validateRequest,
  updateFcmToken
);

export default router;
