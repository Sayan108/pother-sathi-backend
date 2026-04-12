/**
 * Unit Tests for Fare Service
 */

import {
  calculateFare,
  calculateDistance,
  validateCoupon,
} from '../../src/services/fare.service';

describe('calculateDistance', () => {
  it('should return 0 for same location', () => {
    const dist = calculateDistance(22.5726, 88.3639, 22.5726, 88.3639);
    expect(dist).toBe(0);
  });

  it('should calculate a reasonable distance between two Kolkata points', () => {
    // Kolkata to Salt Lake ~5km
    const dist = calculateDistance(22.5726, 88.3639, 22.575, 88.41);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(20);
  });

  it('should handle large distances correctly', () => {
    // Delhi to Mumbai ~1150km
    const dist = calculateDistance(28.7041, 77.1025, 19.076, 72.8777);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1500);
  });
});

describe('calculateFare', () => {
  it('should calculate fare for auto with 5km', () => {
    const fare = calculateFare(5, 'auto');
    expect(fare.baseFare).toBe(30);
    expect(fare.totalFare).toBeGreaterThan(0);
    expect(fare.platformFee).toBeGreaterThan(0);
    expect(fare.driverEarning).toBeGreaterThan(0);
    expect(fare.finalFare).toBeGreaterThanOrEqual(10);
    expect(fare.estimatedDuration).toBeGreaterThan(0);
  });

  it('should apply minimum fare for very short distances', () => {
    const fare = calculateFare(0.1, 'bike');
    // Min fare for bike is 40
    expect(fare.finalFare).toBeGreaterThanOrEqual(10);
    expect(fare.totalFare).toBeGreaterThanOrEqual(40);
  });

  it('should apply coupon discount correctly', () => {
    const fareWithoutCoupon = calculateFare(10, 'car');
    const fareWithCoupon = calculateFare(10, 'car', 'SAVE50');
    expect(fareWithCoupon.discount).toBeGreaterThan(0);
    expect(fareWithCoupon.finalFare).toBeLessThan(fareWithoutCoupon.finalFare);
  });

  it('should not discount more than 50% of fare', () => {
    const fare = calculateFare(1, 'bike', 'WELCOME100'); // Min fare ~40
    expect(fare.discount).toBeLessThanOrEqual(fare.totalFare * 0.5);
  });

  it('should handle all vehicle types', () => {
    const vehicleTypes: Array<'bike' | 'auto' | 'toto' | 'car' | 'delivery'> = [
      'bike', 'auto', 'toto', 'car', 'delivery',
    ];
    vehicleTypes.forEach((type) => {
      const fare = calculateFare(5, type);
      expect(fare.finalFare).toBeGreaterThan(0);
      expect(fare.platformFee).toBeGreaterThan(0);
      expect(fare.driverEarning).toBeGreaterThan(0);
    });
  });

  it('should produce non-negative driver earnings', () => {
    const fare = calculateFare(5, 'auto');
    expect(fare.driverEarning).toBeGreaterThanOrEqual(0);
    expect(fare.platformFee).toBeGreaterThanOrEqual(0);
  });

  it('should have correct fare breakdown: driverEarning + platformFee = totalFare', () => {
    const fare = calculateFare(10, 'auto');
    // Allow 1 INR tolerance due to ceiling rounding
    expect(Math.abs(fare.driverEarning + fare.platformFee - fare.totalFare)).toBeLessThanOrEqual(1);
  });
});

describe('validateCoupon', () => {
  it('should return valid for known coupon SAVE50', () => {
    const result = validateCoupon('SAVE50');
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(50);
  });

  it('should return valid for lowercase coupon save50', () => {
    const result = validateCoupon('save50');
    expect(result.valid).toBe(true);
  });

  it('should return invalid for unknown coupon', () => {
    const result = validateCoupon('INVALID99');
    expect(result.valid).toBe(false);
    expect(result.discountAmount).toBe(0);
  });

  it('should return valid for WELCOME100', () => {
    const result = validateCoupon('WELCOME100');
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(100);
  });

  it('should return valid for RIDE20', () => {
    const result = validateCoupon('RIDE20');
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(20);
  });
});
