/**
 * Rider API Tests
 * Tests for /api/rider/* endpoints
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { Application } from 'express';
import { createApp } from '../../src/app';
import { User } from '../../src/models/User';
import { Ride } from '../../src/models/Ride';
import { Driver } from '../../src/models/Driver';
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
  generateRiderToken,
  generateDriverToken,
} from '../setup/helpers';

let app: Application;
let riderToken: string;
let riderId: string;

beforeAll(async () => {
  await connectTestDB();
  app = createApp();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearCollections();

  // Create a rider user
  const user = await User.create({
    phone: '9876543210',
    countryCode: '+91',
    isVerified: true,
    name: 'Test Rider',
    email: 'rider@test.com',
  });
  riderId = user._id.toString();
  riderToken = generateRiderToken(riderId, '9876543210');
});

// ── GET /api/rider/profile ─────────────────────────────────────────────────────

describe('GET /api/rider/profile', () => {
  it('should return rider profile with valid token', async () => {
    const start = Date.now();
    const res = await request(app)
      .get('/api/rider/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('phone', '9876543210');
    console.log(`[GET /api/rider/profile] status=${res.status} time=${time}ms`);
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/rider/profile');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/rider/profile')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 403 if accessed by driver role token', async () => {
    // Create a driver and use driver token
    const driver = await Driver.create({
      phone: '9876500001',
      countryCode: '+91',
      accountStatus: 'verified',
      name: 'Test Driver',
      vehicleType: 'auto',
      vehicleModel: 'Bajaj RE',
      vehicleNumber: 'WB01A1234',
    });
    const driverToken = generateDriverToken(driver._id.toString(), '9876500001');

    const res = await request(app)
      .get('/api/rider/profile')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

// ── PUT /api/rider/profile ─────────────────────────────────────────────────────

describe('PUT /api/rider/profile', () => {
  it('should update rider profile with valid data', async () => {
    const start = Date.now();
    const res = await request(app)
      .put('/api/rider/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Updated Name', email: 'updated@test.com' });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(`[PUT /api/rider/profile] status=${res.status} time=${time}ms`);
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .put('/api/rider/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ email: 'not-an-email' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 without token', async () => {
    const res = await request(app)
      .put('/api/rider/profile')
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/rider/rides ───────────────────────────────────────────────────────

describe('GET /api/rider/rides', () => {
  it('should return empty ride history for new rider', async () => {
    const start = Date.now();
    const res = await request(app)
      .get('/api/rider/rides')
      .set('Authorization', `Bearer ${riderToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    console.log(`[GET /api/rider/rides] status=${res.status} time=${time}ms`);
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/rider/rides');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/rider/rides/:rideId ───────────────────────────────────────────────

describe('GET /api/rider/rides/:rideId', () => {
  it('should return 404 for non-existent ride', async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const start = Date.now();
    const res = await request(app)
      .get(`/api/rider/rides/${fakeRideId}`)
      .set('Authorization', `Bearer ${riderToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    console.log(`[GET /api/rider/rides/:rideId not found] status=${res.status} time=${time}ms`);
  });

  it('should return ride data when ride exists and belongs to rider', async () => {
    const driver = await Driver.create({
      phone: '9000000099',
      countryCode: '+91',
      accountStatus: 'verified',
      name: 'Driver X',
      vehicleType: 'auto',
      vehicleModel: 'Model A',
      vehicleNumber: 'WB01B9999',
    });

    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: driver._id,
      pickup: { lat: 22.5726, lng: 88.3639, address: 'Kolkata' },
      drop: { lat: 22.6, lng: 88.4, address: 'Somewhere' },
      distance: 5,
      duration: 15,
      vehicleType: 'auto',
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: 'cash',
      otp: '1234',
      status: 'completed',
    });

    const res = await request(app)
      .get(`/api/rider/rides/${ride._id}`)
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/rider/fcm-token ───────────────────────────────────────────────────

describe('PUT /api/rider/fcm-token', () => {
  it('should update FCM token', async () => {
    const start = Date.now();
    const res = await request(app)
      .put('/api/rider/fcm-token')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ fcmToken: 'test-fcm-token-abc123' });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(`[PUT /api/rider/fcm-token] status=${res.status} time=${time}ms`);
  });

  it('should return 400 when fcmToken is missing', async () => {
    const res = await request(app)
      .put('/api/rider/fcm-token')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 without token', async () => {
    const res = await request(app)
      .put('/api/rider/fcm-token')
      .send({ fcmToken: 'some-token' });

    expect(res.status).toBe(401);
  });
});
