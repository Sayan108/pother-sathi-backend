/**
 * Auth API Tests
 * Tests for POST /api/auth/send-otp, /api/auth/verify-otp, /api/auth/refresh, /api/auth/logout
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../src/app';
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
  generateRiderToken,
} from '../setup/helpers';

let app: Application;

beforeAll(async () => {
  await connectTestDB();
  app = createApp();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
});

// ── POST /api/auth/send-otp ────────────────────────────────────────────────────

describe('POST /api/auth/send-otp', () => {
  it('should return 200 and OTP in demo mode for valid rider phone', async () => {
    const start = Date.now();
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'rider' });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('phone', '9876543210');
    console.log(`[send-otp valid rider] status=${res.status} time=${time}ms`);
  });

  it('should return 200 and OTP in demo mode for valid driver phone', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543211', countryCode: '+91', role: 'driver' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 for invalid phone (too short)', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '123', countryCode: '+91', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing role', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid role', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'admin' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing phone', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ countryCode: '+91', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid country code', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: 'INVALID', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should handle empty body gracefully', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/auth/verify-otp ──────────────────────────────────────────────────

describe('POST /api/auth/verify-otp', () => {
  beforeEach(async () => {
    // Send OTP first to set up state
    await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'rider' });
  });

  it('should create a new rider and return tokens for valid OTP (demo mode)', async () => {
    const start = Date.now();
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '123456', role: 'rider' });
    const time = Date.now() - start;

    expect(res.status).toBe(201); // New user created
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data).toHaveProperty('role', 'rider');
    expect(res.body.data.isNewUser).toBe(true);
    console.log(`[verify-otp new rider] status=${res.status} time=${time}ms`);
  });

  it('should login existing rider and return 200', async () => {
    // First verify to create the user
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '123456', role: 'rider' });

    // Send OTP again
    await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'rider' });

    // Login again
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '123456', role: 'rider' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isNewUser).toBe(false);
  });

  it('should return 400 for wrong OTP', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '000000', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for OTP with wrong length', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '123', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing phone', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ countryCode: '+91', otp: '123456', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing otp', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'rider' });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('should create a new driver stub account', async () => {
    await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543211', countryCode: '+91', role: 'driver' });

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543211', countryCode: '+91', otp: '123456', role: 'driver' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('driver');
    expect(res.body.data).toHaveProperty('accessToken');
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  let refreshToken: string;
  let userId: string;

  beforeEach(async () => {
    // Create a rider
    await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'rider' });
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '123456', role: 'rider' });
    refreshToken = res.body.data.refreshToken;
    userId = res.body.data.user.id;
  });

  it('should return a new access token with valid refresh token', async () => {
    const start = Date.now();
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    console.log(`[refresh token] status=${res.status} time=${time}ms`);
  });

  it('should return 401 for invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let accessToken: string;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', countryCode: '+91', role: 'rider' });
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '9876543210', countryCode: '+91', otp: '123456', role: 'rider' });
    accessToken = res.body.data.accessToken;
  });

  it('should logout successfully with valid token', async () => {
    const start = Date.now();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(`[logout] status=${res.status} time=${time}ms`);
  });

  it('should return 401 for missing token', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 for invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer invalidtoken');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
