import { Server as SocketServer } from "socket.io";
import mongoose from "mongoose";
import { Driver } from "../models/Driver";
import { Ride } from "../models/Ride";
import { Transaction } from "../models/Transaction";
import { User } from "../models/User";
import { AuthenticatedSocket } from "./socket.middleware";
import { riderSocketMap } from "../controllers/ride.controller";
import { isDriverKycApproved } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";

export const driverSocketMap = new Map<string, string>();

type Ack = (payload: Record<string, unknown>) => void;

function fail(cb: Ack | undefined, error: string) {
  cb?.({ success: false, error });
}

async function getApprovedDriver(driverId: string) {
  const driver = await Driver.findById(driverId);
  if (!driver?.isActive || !isDriverKycApproved(driver)) return null;
  return driver;
}

function emitToRider(
  io: SocketServer,
  riderId: mongoose.Types.ObjectId,
  event: string,
  payload: Record<string, unknown>,
) {
  io.to(`rider:${riderId.toString()}`).emit(event, payload);
  const riderSocketId = riderSocketMap.get(riderId.toString());
  if (riderSocketId) io.to(riderSocketId).emit(event, payload);
}

async function emitRideRequestToDriver(
  io: SocketServer,
  ride: any,
  driver: any,
) {
  const driverSocketId = driverSocketMap.get(driver._id.toString());
  if (!driverSocketId) return false;

  const rider = await User.findById(ride.riderId)
    .select("name phone avatar rating")
    .lean();
  const rideRequestPayload = {
    rideId: ride._id,
    pickup: ride.pickup,
    drop: ride.drop,
    fare: ride.fare,
    platformFee: ride.platformFee,
    income: ride.driverEarning,
    driverEarning: ride.driverEarning,
    paymentMethod: ride.paymentMethod,
    riderId: ride.riderId,
    rider: rider
      ? {
          name: rider.name,
          phone: rider.phone,
          avatar: rider.avatar,
          rating: rider.rating,
        }
      : undefined,
    vehicleType: ride.vehicleType,
    distance: ride.distance != null ? `${Number(ride.distance).toFixed(1)} km` : undefined,
    distanceKm: ride.distance,
    estimatedDuration: ride.duration,
  };

  io.to(driverSocketId).emit("ride:request", rideRequestPayload);
  io.to(driverSocketId).emit("ride:assigned", rideRequestPayload);
  io.to(driverSocketId).emit("pickup:route", {
    rideId: ride._id,
    pickup: ride.pickup,
    driverLocation: driver.location?.coordinates,
  });
  io.to(driverSocketId).emit("destination:route", {
    rideId: ride._id,
    pickup: ride.pickup,
    drop: ride.drop,
  });
  return true;
}

async function offerRideToNextDriver(
  io: SocketServer,
  rideId: string,
  rejectedDriverId: string,
) {
  const ride = await Ride.findOne({
    _id: rideId,
    status: "requested",
    driverId: rejectedDriverId,
  });

  if (!ride) return { success: false, error: "Ride is no longer available" };

  const rejectedObjectId = new mongoose.Types.ObjectId(rejectedDriverId);
  const alreadyRejected = (ride.rejectedDriverIds ?? []).some((id) =>
    id.equals(rejectedObjectId),
  );
  if (!alreadyRejected) {
    ride.rejectedDriverIds = [...(ride.rejectedDriverIds ?? []), rejectedObjectId];
  }

  const rejectedIds = (ride.rejectedDriverIds ?? []).map((id) => id.toString());
  const liveDriverIds = Array.from(driverSocketMap.keys()).filter(
    (driverId) => !rejectedIds.includes(driverId),
  );

  const candidates = await Driver.find({
    _id: {
      $in: liveDriverIds.map((id) => new mongoose.Types.ObjectId(id)),
      $nin: ride.rejectedDriverIds ?? [],
    },
    vehicleType: ride.vehicleType,
    $or: [{ accountStatus: "verified" }, { kycStatus: "approved" }],
    isActive: true,
    isOnline: true,
    isAvailable: true,
  });

  for (const candidate of candidates) {
    ride.driverId = candidate._id;
    await ride.save();
    const offered = await emitRideRequestToDriver(io, ride, candidate);
    if (offered) {
      return { success: true, reassigned: true };
    }
  }

  ride.status = "no_driver" as any;
  ride.driverId = undefined;
  await ride.save();
  emitToRider(io, ride.riderId, "ride:no_driver", {
    rideId: ride._id,
    reason: "All available drivers rejected the ride",
  });
  emitToRider(io, ride.riderId, "ride:driver_not_found", {
    rideId: ride._id,
    reason: "All available drivers rejected the ride",
  });

  return { success: true, noDriver: true };
}

export async function registerDriverSocketHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket,
): Promise<void> {
  const driverId = socket.userId;
  const connectedDriver = await Driver.findById(driverId).select(
    "isActive accountStatus kycStatus",
  );

  if (!connectedDriver?.isActive) {
    socket.disconnect(true);
    return;
  }

  socket.join(`driver:${driverId}`);
  socket.join("drivers");
  driverSocketMap.set(driverId, socket.id);
  await Driver.findByIdAndUpdate(driverId, { socketId: socket.id }).exec();

  logger.debug(`Driver ${driverId} connected [socket: ${socket.id}]`);

  const requireApproved = async (cb?: Ack) => {
    const driver = await getApprovedDriver(driverId);
    if (!driver) {
      fail(cb, "Driver KYC approval required");
      return null;
    }
    return driver;
  };

  socket.on("driver:join_available", async (_data, cb: Ack) => {
    const driver = await requireApproved(cb);
    if (!driver) return;
    if (!driver.isOnline || !driver.isAvailable) {
      fail(cb, "Driver must be online and available");
      return;
    }
    socket.join("drivers:available");
    cb?.({ success: true });
  });

  socket.on("ride:accept", async (data, cb: Ack) => {
    try {
      const driver = await requireApproved(cb);
      if (!driver) return;
      const { rideId } = data || {};
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: { $in: ["requested", "searching"] },
      });
      if (!ride) {
        fail(cb, "Ride is no longer available");
        return;
      }
      if (!driver.isOnline || !driver.isAvailable) {
        fail(cb, "You must be online and available to accept rides");
        return;
      }

      ride.driverId = new mongoose.Types.ObjectId(driverId);
      ride.status = "driver_on_the_way" as any;
      ride.driverAssignedAt = new Date();
      await ride.save();

      driver.isAvailable = false;
      driver.currentRideId = ride._id;
      await driver.save();

      const payload = {
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
      };
      emitToRider(io, ride.riderId, "driver:assigned", payload);
      emitToRider(io, ride.riderId, "ride:driver_assigned", payload);

      cb?.({
        success: true,
        rideId: ride._id,
        pickup: ride.pickup,
        drop: ride.drop,
        fare: ride.fare,
        income: ride.driverEarning,
        driverEarning: ride.driverEarning,
      });
    } catch (err) {
      logger.error("ride:accept error:", err);
      fail(cb, "Unable to accept ride");
    }
  });

  const arrivedHandler = async (data: any, cb: Ack) => {
    try {
      const driver = await requireApproved(cb);
      if (!driver) return;
      const ride = await Ride.findOne({
        _id: data?.rideId,
        driverId,
        status: { $in: ["accepted", "driver_on_the_way", "driver_assigned"] },
      });
      if (!ride) {
        fail(cb, "Active ride not found");
        return;
      }
      ride.status = "driver_arrived";
      ride.driverArrivedAt = new Date();
      await ride.save();
      emitToRider(io, ride.riderId, "driver:arrived", { rideId: ride._id });
      emitToRider(io, ride.riderId, "ride:driver_arrived", { rideId: ride._id });
      cb?.({ success: true });
    } catch (err) {
      logger.error("ride:arrived error:", err);
      fail(cb, "Unable to mark arrival");
    }
  };
  socket.on("driver:arrived_pickup", arrivedHandler);
  socket.on("ride:arrived", arrivedHandler);

  const otpHandler = async (data: any, cb: Ack) => {
    try {
      const driver = await requireApproved(cb);
      if (!driver) return;
      const ride = await Ride.findOne({
        _id: data?.rideId,
        driverId,
        status: "driver_arrived",
      });
      if (!ride) {
        fail(cb, "Ride not found or not in correct state");
        return;
      }
      if (ride.otp !== data?.otp) {
        fail(cb, "Incorrect OTP. Please verify with the rider.");
        return;
      }
      ride.status = "otp_verified";
      ride.otpVerifiedAt = new Date();
      await ride.save();
      cb?.({ success: true, rideId: ride._id, status: ride.status });
    } catch (err) {
      logger.error("ride:otp_verify error:", err);
      fail(cb, "Unable to verify OTP");
    }
  };
  socket.on("ride:otp_verify", otpHandler);
  socket.on("ride:verify_otp", otpHandler);

  socket.on("ride:start", async (data, cb: Ack) => {
    try {
      const driver = await requireApproved(cb);
      if (!driver) return;
      const ride = await Ride.findOne({
        _id: data?.rideId,
        driverId,
        status: "otp_verified",
      });
      if (!ride) {
        fail(cb, "Ride must be OTP verified before start");
        return;
      }
      ride.status = "started" as any;
      ride.startedAt = new Date();
      await ride.save();
      emitToRider(io, ride.riderId, "ride:started", { rideId: ride._id });
      cb?.({ success: true, rideId: ride._id, status: ride.status });
    } catch (err) {
      logger.error("ride:start error:", err);
      fail(cb, "Unable to start ride");
    }
  });

  socket.on("ride:complete", async (data, cb: Ack) => {
    try {
      const driver = await requireApproved(cb);
      if (!driver) return;
      const ride = await Ride.findOne({
        _id: data?.rideId,
        driverId,
        status: { $in: ["started", "in_progress"] },
      });
      if (!ride) {
        fail(cb, "Ride must be started before completion");
        return;
      }

      if (ride.paymentMethod === "wallet") {
        const rider = await User.findById(ride.riderId);
        if (!rider) {
          fail(cb, "Rider account not found");
          return;
        }
        if (rider.walletBalance < ride.fare) {
          fail(cb, "Insufficient rider wallet balance to complete the ride");
          return;
        }
        const balanceBefore = rider.walletBalance;
        rider.walletBalance -= ride.fare;
        await rider.save();
        await Transaction.create({
          userId: rider._id,
          userModel: "User",
          type: "ride_payment",
          amount: -ride.fare,
          balanceBefore,
          balanceAfter: rider.walletBalance,
          rideId: ride._id,
          description: `Ride payment for ${ride.pickup.address || "pickup"} to ${ride.drop.address || "drop"}`,
          status: "completed",
        });
        ride.isPaid = true;
      } else {
        ride.isPaid = ride.paymentMethod === "cash";
      }

      ride.status = "completed";
      ride.completedAt = new Date();
      await ride.save();

      const balanceBefore = driver.walletBalance;
      driver.walletBalance = Math.max(0, driver.walletBalance - ride.platformFee);
      driver.totalEarnings += ride.driverEarning;
      driver.totalRides += 1;
      driver.isAvailable = true;
      driver.currentRideId = undefined;
      await driver.save();
      await Transaction.create({
        userId: driver._id,
        userModel: "Driver",
        type: "platform_fee",
        amount: -ride.platformFee,
        balanceBefore,
        balanceAfter: driver.walletBalance,
        rideId: ride._id,
        description: `Platform fee deduction for ride ${ride._id}`,
        status: "completed",
      });

      await User.findByIdAndUpdate(ride.riderId, { $inc: { totalRides: 1 } });
      emitToRider(io, ride.riderId, "ride:completed", {
        rideId: ride._id,
        fare: ride.fare,
        paymentMethod: ride.paymentMethod,
      });
      cb?.({
        success: true,
        rideId: ride._id,
        earning: ride.driverEarning,
        platformFee: ride.platformFee,
        walletBalance: driver.walletBalance,
      });
    } catch (err) {
      logger.error("ride:complete error:", err);
      fail(cb, "Unable to complete ride");
    }
  });

  socket.on("ride:cancel", async (data, cb: Ack) => {
    try {
      const driver = await requireApproved(cb);
      if (!driver) return;
      const ride = await Ride.findOne({
        _id: data?.rideId,
        driverId,
        status: {
          $in: [
            "requested",
            "searching",
            "accepted",
            "driver_on_the_way",
            "driver_assigned",
            "driver_arrived",
            "otp_verified",
          ],
        },
      });
      if (!ride) {
        fail(cb, "Cancellable ride not found");
        return;
      }
      ride.status = "cancelled";
      ride.cancelledBy = "driver";
      ride.cancellationReason = data?.reason;
      ride.cancelledAt = new Date();
      await ride.save();
      driver.isAvailable = true;
      driver.currentRideId = undefined;
      await driver.save();
      emitToRider(io, ride.riderId, "ride:cancelled", {
        rideId: ride._id,
        cancelledBy: "driver",
        reason: data?.reason,
      });
      emitToRider(io, ride.riderId, "ride:driver_cancelled", {
        rideId: ride._id,
        cancelledBy: "driver",
        reason: data?.reason,
      });
      cb?.({ success: true });
    } catch (err) {
      logger.error("ride:cancel error:", err);
      fail(cb, "Unable to cancel ride");
    }
  });

  const locationHandler = async (
    data: { lat: number; lng: number; rideId?: string },
    cb?: Ack,
  ) => {
    const driver = await requireApproved(cb);
    if (!driver) return;
    const { lat, lng, rideId } = data || {};
    if (typeof lat !== "number" || typeof lng !== "number") return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    if (!rideId && (!driver.isOnline || !driver.isAvailable)) {
      fail(cb, "Driver must be online and available to update availability location");
      return;
    }

    await Driver.findByIdAndUpdate(driverId, {
      "location.coordinates": [lng, lat],
    });

    if (rideId) {
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: {
          $in: [
            "accepted",
            "driver_on_the_way",
            "driver_assigned",
            "driver_arrived",
            "otp_verified",
            "started",
            "in_progress",
          ],
        },
      })
        .select("riderId status")
        .lean();

      if (!ride) {
        fail(cb, "Assigned ride not found");
        return;
      }
      emitToRider(io, ride.riderId as any, "driver:location", {
        lat,
        lng,
        rideId,
      });
      if (["started", "in_progress"].includes(ride.status)) {
        await Ride.findByIdAndUpdate(rideId, {
          $push: { driverPath: { lat, lng, timestamp: new Date() } },
        });
      }
    }
    cb?.({ success: true });
  };
  socket.on("driver:location:update", locationHandler);
  socket.on("driver:location_update", locationHandler);

  socket.on("driver:reject_ride", async (data: { rideId: string }, cb?: Ack) => {
    try {
      logger.debug(`Driver ${driverId} rejected ride ${data.rideId}`);
      const result = await offerRideToNextDriver(io, data.rideId, driverId);
      cb?.(result);
    } catch (err) {
      logger.error("driver:reject_ride error:", err);
      fail(cb, "Unable to reject ride");
    }
  });

  socket.on("disconnect", async (reason) => {
    logger.debug(`Driver ${driverId} disconnected: ${reason}`);
    const remainingSockets = await io.in(`driver:${driverId}`).fetchSockets();
    const replacementSocket = remainingSockets.find((s) => s.id !== socket.id);

    if (replacementSocket) {
      driverSocketMap.set(driverId, replacementSocket.id);
      await Driver.findByIdAndUpdate(driverId, {
        $set: { socketId: replacementSocket.id },
      });
      return;
    }

    if (driverSocketMap.get(driverId) === socket.id) {
      driverSocketMap.delete(driverId);
      await Driver.findByIdAndUpdate(driverId, {
        $set: { socketId: null },
      });
    }
  });
}
