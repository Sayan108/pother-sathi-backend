import mongoose from "mongoose";
import { env } from "../config/environment";
import { Driver, IDriver, VehicleType } from "../models/Driver";
import { ICoordinate, IRide } from "../models/Ride";

export function isRideRequestExpired(ride: Pick<IRide, "createdAt" | "status">): boolean {
  if (!["requested", "searching"].includes(ride.status)) return false;
  const expiresAt =
    new Date(ride.createdAt).getTime() + env.RIDE_REQUEST_EXPIRY_SECONDS * 1000;
  return Date.now() > expiresAt;
}

export function isFreshDriverLocation(driver: Partial<IDriver>): boolean {
  const lastLocationAt = driver.locationUpdatedAt || driver.updatedAt;
  if (!lastLocationAt) return false;
  const ageMs = Date.now() - new Date(lastLocationAt).getTime();
  return ageMs <= env.DRIVER_LOCATION_STALE_AFTER_SECONDS * 1000;
}

export function getDriverDistanceFromPickupKm(
  driver: Partial<IDriver>,
  pickup: ICoordinate,
): number | null {
  const coordinates = driver.location?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  const radians = (deg: number) => (deg * Math.PI) / 180;
  const dLat = radians(pickup.lat - lat);
  const dLng = radians(pickup.lng - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat)) * Math.cos(radians(pickup.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

export function buildNearbyDriverQuery(
  pickup: ICoordinate,
  vehicleType: VehicleType,
  excludedDriverIds: string[] = [],
) {
  const staleCutoff = new Date(
    Date.now() - env.DRIVER_LOCATION_STALE_AFTER_SECONDS * 1000,
  );

  return {
    ...(excludedDriverIds.length
      ? { _id: { $nin: excludedDriverIds.map((id) => new mongoose.Types.ObjectId(id)) } }
      : {}),
    vehicleType,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [pickup.lng, pickup.lat] },
        $maxDistance: env.MAX_DRIVER_PICKUP_RADIUS_KM * 1000,
      },
    },
    isActive: true,
    isOnline: true,
    isAvailable: true,
    $and: [
      { $or: [{ accountStatus: "verified" }, { kycStatus: "approved" }] },
      {
        $or: [
          { locationUpdatedAt: { $gte: staleCutoff } },
          { locationUpdatedAt: { $exists: false }, updatedAt: { $gte: staleCutoff } },
        ],
      },
    ],
  };
}

export async function findNearbyAvailableDrivers(
  pickup: ICoordinate,
  vehicleType: VehicleType,
  liveDriverIds: string[],
  excludedDriverIds: string[] = [],
) {
  if (!liveDriverIds.length) return [];
  const excluded = new Set(excludedDriverIds);
  const eligibleLiveDriverIds = liveDriverIds.filter((id) => !excluded.has(id));
  if (!eligibleLiveDriverIds.length) return [];

  const query = buildNearbyDriverQuery(pickup, vehicleType, excludedDriverIds);
  return Driver.find({
    ...query,
    _id: {
      $in: eligibleLiveDriverIds.map((id) => new mongoose.Types.ObjectId(id)),
      ...(query as any)._id,
    },
  })
    .limit(20)
    .lean();
}
