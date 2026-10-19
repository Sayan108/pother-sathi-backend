import mongoose from "mongoose";
import { env } from "../config/environment";
import { Driver } from "../models/Driver";
import { IRide } from "../models/Ride";
import { Transaction } from "../models/Transaction";

const CHARGEABLE_CANCEL_STATUSES = new Set([
  "accepted",
  "driver_on_the_way",
  "driver_assigned",
  "driver_arrived",
  "otp_verified",
]);

export function isDriverCancelChargeable(status: string): boolean {
  return CHARGEABLE_CANCEL_STATUSES.has(status);
}

export function resolveDriverCancelFee(ride: Pick<IRide, "platformFee">): number {
  if (Number.isFinite(env.DRIVER_CANCEL_FEE) && env.DRIVER_CANCEL_FEE >= 0) {
    return Math.ceil(env.DRIVER_CANCEL_FEE);
  }
  return Math.max(0, Math.ceil(Number(ride.platformFee) || 0));
}

/**
 * Deduct cancellation charge after a driver cancels an accepted ride.
 * Uses ride.platformFee unless DRIVER_CANCEL_FEE is configured.
 */
export async function applyDriverCancellationFee(
  driverId: string | mongoose.Types.ObjectId,
  ride: Pick<IRide, "_id" | "platformFee" | "status">,
  statusAtCancel: string,
): Promise<{ fee: number; walletBalance?: number }> {
  if (!isDriverCancelChargeable(statusAtCancel)) {
    return { fee: 0 };
  }

  const fee = resolveDriverCancelFee(ride);
  if (fee <= 0) {
    return { fee: 0 };
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    return { fee: 0 };
  }

  const balanceBefore = driver.walletBalance;
  driver.walletBalance = Math.max(0, driver.walletBalance - fee);
  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "platform_fee",
    amount: -fee,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    rideId: ride._id,
    description: `Cancellation fee for ride ${ride._id}`,
    status: "completed",
  });

  return { fee, walletBalance: driver.walletBalance };
}

export type RideHistoryStatusFilter = "all" | "completed" | "cancelled";

export function parseRideHistoryStatus(
  raw: unknown,
): RideHistoryStatusFilter {
  const value = String(raw ?? "all").toLowerCase();
  if (value === "completed" || value === "cancelled") return value;
  return "all";
}

export function buildRideHistoryStatusQuery(
  status: RideHistoryStatusFilter,
): Record<string, unknown> {
  if (status === "completed") return { status: "completed" };
  if (status === "cancelled") return { status: "cancelled" };
  return { status: { $in: ["completed", "cancelled"] } };
}
