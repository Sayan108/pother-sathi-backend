import { Request, Response } from "express";
import { body } from "express-validator";
import mongoose from "mongoose";
import { Ride, RideStatus } from "../models/Ride";
import { Driver, VehicleType } from "../models/Driver";
import { User } from "../models/User";
import { Transaction } from "../models/Transaction";
import {
  calculateFare,
  calculateDistance,
  validateCoupon,
} from "../services/fare.service";
import { getIO } from "../config/socket";
import { env } from "../config/environment";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendConflict,
} from "../utils/response";
import { logger } from "../utils/logger";

// ─── Validation ───────────────────────────────────────────────────────────────

export const bookRideValidation = [
  body("pickup").customSanitizer((value, { req }) => {
    if (value && typeof value === "object") return value;
    return {
      lat: req.body.pickupLat,
      lng: req.body.pickupLng,
      address: req.body.pickupAddress,
    };
  }),
  body("drop").customSanitizer((value, { req }) => {
    if (value && typeof value === "object") return value;
    return {
      lat: req.body.dropLat,
      lng: req.body.dropLng,
      address: req.body.dropAddress,
    };
  }),
  body("pickup").isObject().withMessage("pickup must be an object"),
  body("pickup.lat")
    .notEmpty()
    .withMessage("pickup.lat is required")
    .bail()
    .isFloat({ min: -90, max: 90 })
    .withMessage("pickup.lat must be a valid latitude")
    .toFloat(),
  body("pickup.lng")
    .notEmpty()
    .withMessage("pickup.lng is required")
    .bail()
    .isFloat({ min: -180, max: 180 })
    .withMessage("pickup.lng must be a valid longitude")
    .toFloat(),
  body("pickup.address").optional().trim(),
  body("drop").isObject().withMessage("drop must be an object"),
  body("drop.lat")
    .notEmpty()
    .withMessage("drop.lat is required")
    .bail()
    .isFloat({ min: -90, max: 90 })
    .withMessage("drop.lat must be a valid latitude")
    .toFloat(),
  body("drop.lng")
    .notEmpty()
    .withMessage("drop.lng is required")
    .bail()
    .isFloat({ min: -180, max: 180 })
    .withMessage("drop.lng must be a valid longitude")
    .toFloat(),
  body("drop.address").optional().trim(),
  body("vehicleType")
    .isIn(["bike", "auto", "toto", "car", "delivery"])
    .withMessage("Invalid vehicle type"),
  body("paymentMethod").optional().isIn(["cash", "wallet", "upi"]),
  body("couponCode").optional().trim().toUpperCase(),
];

export const rateRideValidation = [
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("review").optional().trim().isLength({ max: 500 }),
];

export const cancelRideValidation = [
  body("reason").optional().trim().isLength({ max: 200 }),
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function generateRideOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/rides/book
 * Rider books a ride. Searches for nearby available drivers.
 */
// All ride booking, accepting, arriving, verifying OTP, completing, and canceling logic is now handled via sockets.
// See rider.socket.ts and driver.socket.ts for implementation.

/**
 * GET /api/rides/:rideId
 */
export async function getRide(req: Request, res: Response): Promise<void> {
  const ride = await Ride.findById(req.params.rideId)
    .populate(
      "driverId",
      "name phone avatar vehicleType vehicleNumber vehicleColor rating location",
    )
    .populate("riderId", "name phone avatar rating")
    .lean();

  if (!ride) {
    sendNotFound(res, "Ride not found");
    return;
  }

  // Only rider or assigned driver can view
  const isRider = (ride.riderId as any)?._id?.toString() === req.user!.id;
  const populatedDriverId = (ride.driverId as any)?._id?.toString();
  const isDriver = populatedDriverId === req.user!.id;
  if (!isRider && !isDriver) {
    sendForbidden(res, "Access denied");
    return;
  }

  sendSuccess(res, "Ride details fetched", ride);
}

/**
 * POST /api/rides/:rideId/accept   (Driver)
 * Driver accepts a ride request.
 */
export async function acceptRide(req: Request, res: Response): Promise<void> {
  const driverId = req.user!.id;
  const { rideId } = req.params;

  const [driver, ride] = await Promise.all([
    Driver.findById(driverId),
    Ride.findById(rideId),
  ]);

  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (!ride) {
    sendNotFound(res, "Ride not found");
    return;
  }
  if (ride.status !== "searching") {
    sendConflict(res, "Ride is no longer available");
    return;
  }
  if (!driver.isOnline || !driver.isAvailable) {
    sendError(res, "You must be online and available to accept rides", 400);
    return;
  }

  // Assign driver to ride
  ride.driverId = new mongoose.Types.ObjectId(driverId);
  ride.status = "driver_assigned";
  ride.driverAssignedAt = new Date();
  await ride.save();

  // Mark driver as unavailable
  driver.isAvailable = false;
  driver.currentRideId = ride._id;
  await driver.save();

  // Notify rider
  const io = getIO();
  const riderSocketId = await getRiderSocketId(ride.riderId.toString());
  if (riderSocketId) {
    io.to(riderSocketId).emit("ride:driver_assigned", {
      rideId: ride._id,
      driver: {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        avatar: driver.avatar,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        vehicleColor: driver.vehicleColor,
        rating: driver.rating,
        location: driver.location?.coordinates,
      },
      estimatedArrival: "5 mins",
    });
  }

  sendSuccess(res, "Ride accepted", {
    rideId: ride._id,
    pickup: ride.pickup,
    drop: ride.drop,
    rider: await User.findById(ride.riderId).select("name phone avatar").lean(),
  });
}

/**
 * POST /api/rides/:rideId/arrived   (Driver)
 * Driver marks arrival at pickup.
 */
export async function driverArrived(
  req: Request,
  res: Response,
): Promise<void> {
  const ride = await Ride.findOne({
    _id: req.params.rideId,
    driverId: req.user!.id,
    status: "driver_assigned",
  });

  if (!ride) {
    sendNotFound(res, "Active ride not found");
    return;
  }

  ride.status = "driver_arrived";
  ride.driverArrivedAt = new Date();
  await ride.save();

  const io = getIO();
  const riderSocketId = await getRiderSocketId(ride.riderId.toString());
  if (riderSocketId) {
    io.to(riderSocketId).emit("ride:driver_arrived", { rideId: ride._id });
  }

  sendSuccess(res, "Arrival confirmed. Ask rider for OTP.");
}

/**
 * POST /api/rides/:rideId/verify-otp   (Driver)
 * Driver verifies rider's OTP to start the ride.
 */
export async function verifyRideOTP(
  req: Request,
  res: Response,
): Promise<void> {
  const { otp } = req.body as { otp: string };
  const ride = await Ride.findOne({
    _id: req.params.rideId,
    driverId: req.user!.id,
    status: "driver_arrived",
  });

  if (!ride) {
    sendNotFound(res, "Ride not found or not in correct state");
    return;
  }

  if (ride.otp !== otp) {
    sendError(res, "Incorrect OTP. Please verify with the rider.", 400);
    return;
  }

  ride.status = "in_progress";
  ride.otpVerifiedAt = new Date();
  ride.startedAt = new Date();
  await ride.save();

  const io = getIO();
  const riderSocketId = await getRiderSocketId(ride.riderId.toString());
  if (riderSocketId) {
    io.to(riderSocketId).emit("ride:started", { rideId: ride._id });
  }

  sendSuccess(res, "OTP verified. Ride started!", {
    rideId: ride._id,
    drop: ride.drop,
  });
}

/**
 * POST /api/rides/:rideId/complete   (Driver)
 * Driver completes the ride.
 */
export async function completeRide(req: Request, res: Response): Promise<void> {
  const driverId = req.user!.id;
  const ride = await Ride.findOne({
    _id: req.params.rideId,
    driverId,
    status: "in_progress",
  });

  if (!ride) {
    sendNotFound(res, "Active ride not found");
    return;
  }

  ride.status = "completed";
  ride.completedAt = new Date();
  ride.isPaid = ride.paymentMethod === "cash"; // Cash = auto-paid on completion
  await ride.save();

  // Credit driver's wallet (subtract platform fee)
  const driver = await Driver.findById(driverId);
  if (driver) {
    const balanceBefore = driver.walletBalance;
    // Deduct platform fee from wallet, add ride earning
    driver.walletBalance =
      Math.max(0, driver.walletBalance - ride.platformFee) + ride.driverEarning;
    driver.totalEarnings += ride.driverEarning;
    driver.totalRides += 1;
    driver.isAvailable = true;
    driver.currentRideId = undefined;
    await driver.save();

    // Record transactions
    await Transaction.create([
      {
        userId: driver._id,
        userModel: "Driver",
        type: "ride_earning",
        amount: ride.driverEarning,
        balanceBefore,
        balanceAfter: driver.walletBalance,
        rideId: ride._id,
        description: `Ride earnings from ${ride.pickup.address || "pickup"} to ${ride.drop.address || "drop"}`,
        status: "completed",
      },
      {
        userId: driver._id,
        userModel: "Driver",
        type: "platform_fee",
        amount: -ride.platformFee,
        balanceBefore,
        balanceAfter: driver.walletBalance,
        rideId: ride._id,
        description: `Platform fee for ride ${ride._id}`,
        status: "completed",
      },
    ]);
  }

  // Update rider's total rides
  await User.findByIdAndUpdate(ride.riderId, { $inc: { totalRides: 1 } });

  // Notify rider
  const io = getIO();
  const riderSocketId = await getRiderSocketId(ride.riderId.toString());
  if (riderSocketId) {
    io.to(riderSocketId).emit("ride:completed", {
      rideId: ride._id,
      fare: ride.fare,
      paymentMethod: ride.paymentMethod,
    });
  }

  sendSuccess(res, "Ride completed successfully", {
    rideId: ride._id,
    earning: ride.driverEarning,
    platformFee: ride.platformFee,
    walletBalance: driver?.walletBalance,
  });
}

/**
 * POST /api/rides/:rideId/cancel
 * Cancel a ride (rider or driver).
 */
export async function cancelRide(req: Request, res: Response): Promise<void> {
  const { reason } = req.body as { reason?: string };
  const userId = req.user!.id;
  const role = req.user!.role;

  const query: Record<string, unknown> = {
    _id: req.params.rideId,
    status: { $in: ["searching", "driver_assigned", "driver_arrived"] },
  };

  if (role === "rider") query.riderId = userId;
  else query.driverId = userId;

  const ride = await Ride.findOne(query);
  if (!ride) {
    sendNotFound(res, "Cancellable ride not found");
    return;
  }

  ride.status = "cancelled";
  ride.cancelledBy = role as "rider" | "driver";
  ride.cancellationReason = reason;
  ride.cancelledAt = new Date();
  await ride.save();

  // Free up driver if assigned
  if (ride.driverId) {
    await Driver.findByIdAndUpdate(ride.driverId, {
      $set: { isAvailable: true, currentRideId: null },
    });
  }

  // Notify the other party
  const io = getIO();
  if (role === "rider") {
    // Notify driver
    const driver = await Driver.findById(ride.driverId)
      .select("socketId")
      .lean();
    if (driver?.socketId) {
      io.to(driver.socketId).emit("ride:cancelled", {
        rideId: ride._id,
        cancelledBy: "rider",
        reason,
      });
    }
  } else {
    // Notify rider
    const riderSocketId = await getRiderSocketId(ride.riderId.toString());
    if (riderSocketId) {
      io.to(riderSocketId).emit("ride:driver_cancelled", {
        rideId: ride._id,
        cancelledBy: "driver",
        reason,
      });
    }
  }

  sendSuccess(res, "Ride cancelled");
}

/**
 * POST /api/rides/:rideId/rate
 * Rate the ride (rider rates driver, driver rates rider).
 */
export async function rateRide(req: Request, res: Response): Promise<void> {
  const { rating, review } = req.body as { rating: number; review?: string };
  const role = req.user!.role;

  const ride = await Ride.findOne({
    _id: req.params.rideId,
    status: "completed",
    ...(role === "rider"
      ? { riderId: req.user!.id }
      : { driverId: req.user!.id }),
  });

  if (!ride) {
    sendNotFound(res, "Completed ride not found");
    return;
  }

  if (role === "rider") {
    if (ride.riderRating) {
      sendConflict(res, "You have already rated this ride");
      return;
    }
    ride.riderRating = rating;
    ride.riderReview = review;
    await ride.save();

    // Update driver's average rating
    await updateAverageRating("driver", ride.driverId!.toString(), rating);
  } else {
    if (ride.driverRating) {
      sendConflict(res, "You have already rated this ride");
      return;
    }
    ride.driverRating = rating;
    ride.driverReview = review;
    await ride.save();

    // Update rider's average rating
    await updateAverageRating("rider", ride.riderId.toString(), rating);
  }

  sendSuccess(res, "Rating submitted. Thank you!");
}

/**
 * GET /api/rides/active
 * Get the current active ride for rider or driver.
 */
export async function getActiveRide(
  req: Request,
  res: Response,
): Promise<void> {
  const role = req.user!.role;
  const query: Record<string, unknown> = {
    status: {
      $in: [
        "searching",
        "driver_assigned",
        "driver_arrived",
        "otp_verified",
        "in_progress",
      ],
    },
  };

  if (role === "rider") query.riderId = req.user!.id;
  else query.driverId = req.user!.id;

  const ride = await Ride.findOne(query)
    .populate(
      "driverId",
      "name phone avatar vehicleType vehicleNumber vehicleColor rating location socketId",
    )
    .populate("riderId", "name phone avatar rating")
    .lean();

  if (!ride) {
    sendSuccess(res, "No active ride", null);
    return;
  }
  sendSuccess(res, "Active ride fetched", ride);
}

/**
 * GET /api/rides/fare-estimate
 * Estimate fare without booking.
 */
export async function getFareEstimate(
  req: Request,
  res: Response,
): Promise<void> {
  const { pickupLat, pickupLng, dropLat, dropLng, vehicleType, couponCode } =
    req.query as Record<string, string>;

  if (!pickupLat || !pickupLng || !dropLat || !dropLng || !vehicleType) {
    sendError(
      res,
      "Missing required query params: pickupLat, pickupLng, dropLat, dropLng, vehicleType",
      400,
    );
    return;
  }

  const distanceKm = calculateDistance(
    parseFloat(pickupLat),
    parseFloat(pickupLng),
    parseFloat(dropLat),
    parseFloat(dropLng),
  );

  const fareBreakdown = calculateFare(
    distanceKm,
    vehicleType as VehicleType,
    couponCode,
  );
  sendSuccess(res, "Fare estimate calculated", {
    distanceKm,
    ...fareBreakdown,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// In-memory map: userId → socketId (maintained by socket handlers)
// For production, use Redis
export const riderSocketMap = new Map<string, string>();

async function getRiderSocketId(userId: string): Promise<string | undefined> {
  return riderSocketMap.get(userId);
}

async function updateAverageRating(
  target: "rider" | "driver",
  id: string,
  newRating: number,
): Promise<void> {
  if (target === "driver") {
    const driver = await Driver.findById(id).select("rating totalRatings");
    if (!driver) return;
    const total = driver.totalRatings + 1;
    driver.rating = parseFloat(
      ((driver.rating * driver.totalRatings + newRating) / total).toFixed(2),
    );
    driver.totalRatings = total;
    await driver.save();
  } else {
    const user = await User.findById(id).select("rating totalRatings");
    if (!user) return;
    const total = user.totalRatings + 1;
    user.rating = parseFloat(
      ((user.rating * user.totalRatings + newRating) / total).toFixed(2),
    );
    user.totalRatings = total;
    await user.save();
  }
}
