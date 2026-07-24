import { Server as SocketServer } from "socket.io";
import { Ride } from "../models/Ride";
import { User } from "../models/User";
import { AuthenticatedSocket } from "./socket.middleware";
import { driverSocketMap } from "./driver.socket";
import { riderSocketMap } from "../controllers/ride.controller";
import { logger } from "../utils/logger";
import { calculateFareFromBasePrice, validateCoupon } from "../services/fare.service";
import { getRoadRouteMetrics } from "../services/route-distance.service";
import { findNearbyAvailableDrivers } from "../services/ride-matching.service";

function getLiveDriverSocketId(driver: any): string | undefined {
  const driverId = driver?._id?.toString();
  if (!driverId) return undefined;
  return driverSocketMap.get(driverId);
}

export function registerRiderSocketHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket,
): void {
  const riderId = socket.userId;

  // Join rider-specific room
  socket.join(`rider:${riderId}`);
  socket.join("riders");

  // Register in-memory socket map (used by ride controller to push events)
  riderSocketMap.set(riderId, socket.id);

  logger.debug(`Rider ${riderId} connected [socket: ${socket.id}]`);

  /**
   * ride:search
   * Rider requests fare estimate and available drivers.
   * Payload: { pickup: { lat, lng, address }, drop: { lat, lng, address }, vehicleType, couponCode }
   */
  socket.on("ride:search", async (data, cb) => {
    try {
      const { pickup, drop, vehicleType, couponCode } = data;
      if (couponCode) {
        const couponResult = validateCoupon(couponCode);
        if (!couponResult.valid) {
          cb({ success: false, error: "Invalid coupon code" });
          return;
        }
      }
      const routeMetrics = await getRoadRouteMetrics(pickup, drop);
      const distanceKm = routeMetrics.distanceKm;
      const fareBreakdown = await calculateFareFromBasePrice(
        distanceKm,
        vehicleType,
        couponCode,
      );
      fareBreakdown.estimatedDuration = routeMetrics.durationMinutes;
      const liveDrivers = await findNearbyAvailableDrivers(
        pickup,
        vehicleType,
        Array.from(driverSocketMap.keys()),
      );

      cb({
        success: true,
        fareBreakdown,
        routeMetrics,
        distanceKm,
        availableDrivers: liveDrivers.map((d: any) => ({
          _id: d._id,
          name: d.name,
          phone: d.phone,
          vehicleType: d.vehicleType,
          vehicleModel: d.vehicleModel,
          vehicleNumber: d.vehicleNumber,
          vehicleColor: d.vehicleColor,
          serviceArea: d.serviceArea,
        })),
      });
    } catch (err) {
      logger.error("ride:search error:", err);
      cb({ success: false, error: "Unable to search for rides" });
    }
  });

  /**
   * ride:book
   * Rider books a ride. Assigns a driver and creates ride.
   * Payload: { pickup, drop, vehicleType, couponCode, paymentMethod }
   */
  socket.on("ride:book", async (data, cb) => {
    try {
      const {
        pickup,
        drop,
        vehicleType,
        couponCode,
        paymentMethod = "cash",
      } = data;
      // Check for active ride
      const existingRide = await Ride.findOne({
        riderId,
        status: {
          $in: [
            "searching",
            "driver_assigned",
            "driver_arrived",
            "otp_verified",
            "in_progress",
          ],
        },
      });
      if (existingRide) {
        cb({ success: false, error: "You already have an active ride" });
        return;
      }
      // Validate coupon
      if (couponCode) {
        const couponResult = validateCoupon(couponCode);
        if (!couponResult.valid) {
          cb({ success: false, error: "Invalid coupon code" });
          return;
        }
      }
      const routeMetrics = await getRoadRouteMetrics(pickup, drop);
      const distanceKm = routeMetrics.distanceKm;
      const fareBreakdown = await calculateFareFromBasePrice(
        distanceKm,
        vehicleType,
        couponCode,
      );
      fareBreakdown.estimatedDuration = routeMetrics.durationMinutes;
      const liveDrivers = await findNearbyAvailableDrivers(
        pickup,
        vehicleType,
        Array.from(driverSocketMap.keys()),
      );

      if (!liveDrivers.length) {
        cb({ success: false, error: "No drivers available" });
        return;
      }

      const assignedDriver =
        liveDrivers[Math.floor(Math.random() * liveDrivers.length)];
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const ride = await Ride.create({
        riderId,
        driverId: assignedDriver._id,
        pickup,
        drop,
        distance: distanceKm,
        duration: routeMetrics.durationMinutes,
        vehicleType,
        fare: fareBreakdown.finalFare,
        platformFee: fareBreakdown.platformFee,
        driverEarning: fareBreakdown.driverEarning,
        discount: fareBreakdown.discount,
        couponCode,
        paymentMethod,
        otp,
        status: "requested",
      });
      const rider = await User.findById(riderId)
        .select("name phone avatar rating")
        .lean();

      // Notify driver if online. Prefer the in-memory socket map, fallback to DB socketId.
      const assignedDriverId = assignedDriver._id.toString();
      const driverSocketId = getLiveDriverSocketId(assignedDriver);
      if (driverSocketId) {
        const rideRequestPayload = {
          rideId: ride._id,
          pickup,
          drop,
          fare: ride.fare,
          platformFee: ride.platformFee,
          income: ride.driverEarning,
          driverEarning: ride.driverEarning,
          paymentMethod: ride.paymentMethod,
          riderId,
          rider: rider
            ? {
                name: rider.name,
                phone: rider.phone,
                avatar: rider.avatar,
                rating: rider.rating,
              }
            : undefined,
          vehicleType: ride.vehicleType,
          distance: `${Number(distanceKm).toFixed(1)} km`,
          distanceKm,
          estimatedDuration: routeMetrics.durationMinutes,
          routeMetrics,
        };
        io.to(driverSocketId).emit("ride:request", rideRequestPayload);
        io.to(driverSocketId).emit("ride:assigned", rideRequestPayload);
        io.to(driverSocketId).emit("pickup:route", {
          rideId: ride._id,
          pickup,
          driverLocation: assignedDriver.location?.coordinates,
        });
        io.to(driverSocketId).emit("destination:route", {
          rideId: ride._id,
          pickup,
          drop,
        });
      }
      cb({
        success: true,
        rideId: ride._id,
        otp,
        fareBreakdown,
        routeMetrics,
        status: "requested",
        driver: {
          _id: assignedDriver._id,
          name: assignedDriver.name,
          phone: assignedDriver.phone,
          vehicleType: assignedDriver.vehicleType,
          vehicleModel: assignedDriver.vehicleModel,
          vehicleNumber: assignedDriver.vehicleNumber,
          vehicleColor: assignedDriver.vehicleColor,
          serviceArea: assignedDriver.serviceArea,
        },
      });
    } catch (err) {
      logger.error("ride:book error:", err);
      cb({ success: false, error: "Unable to book ride" });
    }
  });

  /**
   * ride:cancel
   * Rider cancels a ride (searching, assigned, arrived).
   * Payload: { rideId, reason }
   */
  socket.on("ride:cancel", async (data, cb) => {
    try {
      const { rideId, reason } = data;
      const ride = await Ride.findOne({
        _id: rideId,
        riderId,
        status: {
          $in: [
            "requested",
            "searching",
            "accepted",
            "driver_on_the_way",
            "driver_assigned",
            "driver_arrived",
          ],
        },
      });
      if (!ride) {
        cb({ success: false, error: "Cancellable ride not found" });
        return;
      }
      ride.status = "cancelled";
      ride.cancelledBy = "rider";
      ride.cancellationReason = reason;
      ride.cancelledAt = new Date();
      await ride.save();
      // Free up driver if assigned
      if (ride.driverId) {
        const { Driver } = require("../models/Driver");
        await Driver.findByIdAndUpdate(ride.driverId, {
          $set: { isAvailable: true, currentRideId: null },
        });
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
      }
      cb({ success: true });
    } catch (err) {
      logger.error("ride:cancel error:", err);
      cb({ success: false, error: "Unable to cancel ride" });
    }
  });

  // ...existing code...

  /**
   * rider:cancel_search
   * Rider cancels a ride that hasn't been assigned yet.
   * Payload: { rideId: string }
   */
  socket.on("rider:cancel_search", async (data: { rideId: string }) => {
    try {
      const ride = await Ride.findOne({
        _id: data.rideId,
        riderId,
        status: "searching",
      });

      if (!ride) return;

      ride.status = "cancelled";
      ride.cancelledBy = "rider";
      ride.cancelledAt = new Date();
      await ride.save();

      socket.emit("ride:cancelled", {
        rideId: data.rideId,
        cancelledBy: "rider",
      });
      logger.debug(`Rider ${riderId} cancelled searching ride ${data.rideId}`);
    } catch (err) {
      logger.error("rider:cancel_search error:", err);
    }
  });

  /**
   * rider:ping
   * Heartbeat to keep socket alive and check active ride status.
   */
  socket.on("rider:ping", () => {
    socket.emit("rider:pong", { timestamp: Date.now() });
  });

  /**
   * Handle disconnection.
   */
  socket.on("disconnect", (reason) => {
    logger.debug(`Rider ${riderId} disconnected: ${reason}`);
    riderSocketMap.delete(riderId);
  });
}
