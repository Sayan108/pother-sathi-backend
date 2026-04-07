import { Server as SocketServer } from "socket.io";
import { Driver } from "../models/Driver";
import { Ride } from "../models/Ride";
import { AuthenticatedSocket } from "./socket.middleware";
import { riderSocketMap } from "../controllers/ride.controller";
import { logger } from "../utils/logger";

// In-memory map: driverId → socketId
// For production, use Redis
export const driverSocketMap = new Map<string, string>();

export function registerDriverSocketHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket,
): void {
  const driverId = socket.userId;

  // Join driver-specific room
  socket.join(`driver:${driverId}`);

  // Register socket ID in maps and DB
  driverSocketMap.set(driverId, socket.id);
  Driver.findByIdAndUpdate(driverId, { socketId: socket.id }).exec();

  logger.debug(`Driver ${driverId} connected [socket: ${socket.id}]`);

  /**
   * ride:accept
   * Driver accepts a ride request.
   * Payload: { rideId }
   */
  socket.on("ride:accept", async (data, cb) => {
    try {
      const { rideId } = data;
      const ride = await Ride.findOne({
        _id: rideId,
        status: "searching",
      }).lean();
      if (!ride) {
        cb({ success: false, error: "Ride is no longer available" });
        return;
      }
      // Mark driver as unavailable
      const { Driver } = require("../models/Driver");
      const driver = await Driver.findById(driverId);
      if (!driver.isOnline || !driver.isAvailable) {
        cb({
          success: false,
          error: "You must be online and available to accept rides",
        });
        return;
      }
      ride.driverId = new (require("mongoose").Types.ObjectId)(driverId);
      ride.status = "driver_assigned";
      ride.driverAssignedAt = new Date();
      await ride.save();
      driver.isAvailable = false;
      driver.currentRideId = ride._id;
      await driver.save();
      // Notify rider
      const { riderSocketMap } = require("../controllers/ride.controller");
      const riderSocketId = riderSocketMap.get(ride.riderId.toString());
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
            location: driver.location.coordinates,
          },
          estimatedArrival: "5 mins",
        });
      }
      cb({ success: true, rideId: ride._id });
    } catch (err) {
      logger.error("ride:accept error:", err);
      cb({ success: false, error: "Unable to accept ride" });
    }
  });

  /**
   * ride:arrived
   * Driver marks arrival at pickup.
   * Payload: { rideId }
   */
  socket.on("ride:arrived", async (data, cb) => {
    try {
      const { rideId } = data;
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: "driver_assigned",
      });
      if (!ride) {
        cb({ success: false, error: "Active ride not found" });
        return;
      }
      ride.status = "driver_arrived";
      ride.driverArrivedAt = new Date();
      await ride.save();
      const { riderSocketMap } = require("../controllers/ride.controller");
      const riderSocketId = riderSocketMap.get(ride.riderId.toString());
      if (riderSocketId) {
        io.to(riderSocketId).emit("ride:driver_arrived", { rideId: ride._id });
      }
      cb({ success: true });
    } catch (err) {
      logger.error("ride:arrived error:", err);
      cb({ success: false, error: "Unable to mark arrival" });
    }
  });

  /**
   * ride:verify_otp
   * Driver verifies rider's OTP to start the ride.
   * Payload: { rideId, otp }
   */
  socket.on("ride:verify_otp", async (data, cb) => {
    try {
      const { rideId, otp } = data;
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: "driver_arrived",
      });
      if (!ride) {
        cb({ success: false, error: "Ride not found or not in correct state" });
        return;
      }
      if (ride.otp !== otp) {
        cb({
          success: false,
          error: "Incorrect OTP. Please verify with the rider.",
        });
        return;
      }
      ride.status = "in_progress";
      ride.otpVerifiedAt = new Date();
      ride.startedAt = new Date();
      await ride.save();
      const { riderSocketMap } = require("../controllers/ride.controller");
      const riderSocketId = riderSocketMap.get(ride.riderId.toString());
      if (riderSocketId) {
        io.to(riderSocketId).emit("ride:started", { rideId: ride._id });
      }
      cb({ success: true, rideId: ride._id });
    } catch (err) {
      logger.error("ride:verify_otp error:", err);
      cb({ success: false, error: "Unable to verify OTP" });
    }
  });

  /**
   * ride:complete
   * Driver completes the ride, triggers money credit.
   * Payload: { rideId }
   */
  socket.on("ride:complete", async (data, cb) => {
    try {
      const { rideId } = data;
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: "in_progress",
      });
      if (!ride) {
        cb({ success: false, error: "Active ride not found" });
        return;
      }
      ride.status = "completed";
      ride.completedAt = new Date();
      ride.isPaid = ride.paymentMethod === "cash";
      await ride.save();
      // Credit driver's wallet (subtract platform fee)
      const { Driver } = require("../models/Driver");
      const { Transaction } = require("../models/Transaction");
      const driver = await Driver.findById(driverId);
      if (driver) {
        const balanceBefore = driver.walletBalance;
        driver.walletBalance =
          Math.max(0, driver.walletBalance - ride.platformFee) +
          ride.driverEarning;
        driver.totalEarnings += ride.driverEarning;
        driver.totalRides += 1;
        driver.isAvailable = true;
        driver.currentRideId = undefined;
        await driver.save();
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
      const { User } = require("../models/User");
      await User.findByIdAndUpdate(ride.riderId, { $inc: { totalRides: 1 } });
      // Notify rider
      const { riderSocketMap } = require("../controllers/ride.controller");
      const riderSocketId = riderSocketMap.get(ride.riderId.toString());
      if (riderSocketId) {
        io.to(riderSocketId).emit("ride:completed", {
          rideId: ride._id,
          fare: ride.fare,
          paymentMethod: ride.paymentMethod,
        });
      }
      cb({
        success: true,
        rideId: ride._id,
        earning: ride.driverEarning,
        platformFee: ride.platformFee,
        walletBalance: driver?.walletBalance,
      });
    } catch (err) {
      logger.error("ride:complete error:", err);
      cb({ success: false, error: "Unable to complete ride" });
    }
  });

  /**
   * ride:cancel
   * Driver cancels a ride (searching, assigned, arrived).
   * Payload: { rideId, reason }
   */
  socket.on("ride:cancel", async (data, cb) => {
    try {
      const { rideId, reason } = data;
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: { $in: ["searching", "driver_assigned", "driver_arrived"] },
      });
      if (!ride) {
        cb({ success: false, error: "Cancellable ride not found" });
        return;
      }
      ride.status = "cancelled";
      ride.cancelledBy = "driver";
      ride.cancellationReason = reason;
      ride.cancelledAt = new Date();
      await ride.save();
      // Free up driver
      const { Driver } = require("../models/Driver");
      await Driver.findByIdAndUpdate(driverId, {
        $set: { isAvailable: true, currentRideId: null },
      });
      // Notify rider
      const { riderSocketMap } = require("../controllers/ride.controller");
      const riderSocketId = riderSocketMap.get(ride.riderId.toString());
      if (riderSocketId) {
        io.to(riderSocketId).emit("ride:driver_cancelled", {
          rideId: ride._id,
          cancelledBy: "driver",
          reason,
        });
      }
      cb({ success: true });
    } catch (err) {
      logger.error("ride:cancel error:", err);
      cb({ success: false, error: "Unable to cancel ride" });
    }
  });

  // ...existing code...

  /**
   * driver:location_update
   * Driver sends their GPS coordinates periodically.
   * Payload: { lat: number; lng: number; rideId?: string }
   */
  socket.on(
    "driver:location_update",
    async (data: { lat: number; lng: number; rideId?: string }) => {
      const { lat, lng, rideId } = data;

      // Validate coordinates
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      // Update DB location
      await Driver.findByIdAndUpdate(driverId, {
        "location.coordinates": [lng, lat],
      });

      // If in active ride, forward location to rider
      if (rideId) {
        const ride = await Ride.findOne({
          _id: rideId,
          driverId,
          status: { $in: ["driver_assigned", "driver_arrived", "in_progress"] },
        })
          .select("riderId")
          .lean();

        if (ride) {
          const riderSocketId = riderSocketMap.get(ride.riderId.toString());
          if (riderSocketId) {
            io.to(riderSocketId).emit("driver:location", {
              lat,
              lng,
              rideId,
            });
          }

          // Record path point during in_progress
          await Ride.findByIdAndUpdate(rideId, {
            $push: {
              driverPath: { lat, lng, timestamp: new Date() },
            },
          });
        }
      }
    },
  );

  /**
   * driver:reject_ride
   * Driver explicitly rejects a ride request.
   * Payload: { rideId: string }
   */
  socket.on("driver:reject_ride", (data: { rideId: string }) => {
    logger.debug(`Driver ${driverId} rejected ride ${data.rideId}`);
    // No action needed on server unless tracking rejections
  });

  /**
   * Handle disconnection.
   */
  socket.on("disconnect", async (reason) => {
    logger.debug(`Driver ${driverId} disconnected: ${reason}`);
    driverSocketMap.delete(driverId);

    // Mark driver offline when disconnected
    await Driver.findByIdAndUpdate(driverId, {
      $set: { isOnline: false, isAvailable: false, socketId: null },
    });
  });
}
