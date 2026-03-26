import { env } from '../config/environment';
import { VehicleType } from '../models/Driver';

// Base fare per km by vehicle type (in INR)
const FARE_PER_KM: Record<VehicleType, number> = {
  bike: 8,
  auto: 15,
  toto: 12,
  car: 20,
  delivery: 10,
};

// Minimum fare
const MIN_FARE: Record<VehicleType, number> = {
  bike: 40,
  auto: 70,
  toto: 55,
  car: 80,
  delivery: 50,
};

// Base fare (pick-up charge)
const BASE_FARE: Record<VehicleType, number> = {
  bike: 20,
  auto: 30,
  toto: 25,
  car: 40,
  delivery: 25,
};

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  totalFare: number;
  platformFee: number;
  driverEarning: number;
  discount: number;
  finalFare: number;
  estimatedDuration: number; // minutes
}

const COUPONS: Record<string, { discountAmount: number; maxUses: number }> = {
  SAVE50: { discountAmount: 50, maxUses: 1 },
  WELCOME100: { discountAmount: 100, maxUses: 1 },
  RIDE20: { discountAmount: 20, maxUses: 5 },
};

/**
 * Calculates fare based on distance and vehicle type.
 * @param distanceKm - distance in kilometers
 * @param vehicleType - type of vehicle
 * @param couponCode - optional coupon code
 */
export function calculateFare(
  distanceKm: number,
  vehicleType: VehicleType,
  couponCode?: string
): FareBreakdown {
  const base = BASE_FARE[vehicleType];
  const perKm = FARE_PER_KM[vehicleType];
  const minFare = MIN_FARE[vehicleType];

  const rawFare = base + distanceKm * perKm;
  const totalFare = Math.max(rawFare, minFare);
  const roundedFare = Math.ceil(totalFare);

  const platformFeePercent = env.PLATFORM_FEE_PERCENT / 100;
  const platformFee = Math.ceil(roundedFare * platformFeePercent);
  const driverEarning = roundedFare - platformFee;

  let discount = 0;
  if (couponCode) {
    const coupon = COUPONS[couponCode.toUpperCase()];
    if (coupon) {
      discount = Math.min(coupon.discountAmount, roundedFare * 0.5); // Max 50% discount
    }
  }

  const finalFare = Math.max(roundedFare - discount, 10);

  // Estimate duration: assume avg 20 km/h in city  
  const estimatedDuration = Math.ceil((distanceKm / 20) * 60);

  return {
    baseFare: base,
    distanceFare: Math.ceil(distanceKm * perKm),
    totalFare: roundedFare,
    platformFee,
    driverEarning,
    discount,
    finalFare,
    estimatedDuration,
  };
}

/**
 * Validates a coupon code.
 */
export function validateCoupon(code: string): { valid: boolean; discountAmount: number } {
  const coupon = COUPONS[code.toUpperCase()];
  if (!coupon) return { valid: false, discountAmount: 0 };
  return { valid: true, discountAmount: coupon.discountAmount };
}

/**
 * Calculate distance between two lat/lng points using Haversine formula.
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
