import { env } from '../config/environment';
import { VehicleType } from '../models/Driver';
import { BasePrice } from '../models/BasePrice';

export interface FareConfig {
  basePrice: number;
  pricePerKm: number;
  minimumFare: number;
}

export const DEFAULT_FARE_CONFIG: Record<VehicleType, FareConfig> = {
  bike: { basePrice: 20, pricePerKm: 8, minimumFare: 40 },
  auto: { basePrice: 30, pricePerKm: 15, minimumFare: 70 },
  toto: { basePrice: 25, pricePerKm: 12, minimumFare: 55 },
  car: { basePrice: 40, pricePerKm: 20, minimumFare: 80 },
  delivery: { basePrice: 25, pricePerKm: 10, minimumFare: 50 },
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
  couponCode?: string,
  fareConfig?: FareConfig,
): FareBreakdown {
  const config = fareConfig || DEFAULT_FARE_CONFIG[vehicleType];
  const base = config.basePrice;
  const perKm = config.pricePerKm;
  const minFare = config.minimumFare;

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

export async function getFareConfig(vehicleType: VehicleType): Promise<FareConfig> {
  const defaultConfig = DEFAULT_FARE_CONFIG[vehicleType];
  const price = await BasePrice.findOneAndUpdate(
    { vehicleType },
    {
      $setOnInsert: {
        vehicleType,
        ...defaultConfig,
        isActive: true,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  if (!price) return defaultConfig;

  return {
    basePrice: price.basePrice,
    pricePerKm: price.pricePerKm,
    minimumFare: price.minimumFare,
  };
}

export async function calculateFareFromBasePrice(
  distanceKm: number,
  vehicleType: VehicleType,
  couponCode?: string,
): Promise<FareBreakdown> {
  const fareConfig = await getFareConfig(vehicleType);
  return calculateFare(distanceKm, vehicleType, couponCode, fareConfig);
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
