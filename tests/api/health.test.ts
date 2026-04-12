/**
 * Health Check & General API Tests
 */

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../src/app';
import { connectTestDB, disconnectTestDB } from '../setup/helpers';

let app: Application;

beforeAll(async () => {
  await connectTestDB();
  app = createApp();
});

afterAll(async () => {
  await disconnectTestDB();
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const start = Date.now();
    const res = await request(app).get('/health');
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Pather Sathi API is running');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('environment');
    console.log(`[GET /health] status=${res.status} time=${time}ms`);
  });
});

describe('GET /api/health', () => {
  it('should return health status (backward compat)', async () => {
    const start = Date.now();
    const res = await request(app).get('/api/health');
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(`[GET /api/health] status=${res.status} time=${time}ms`);
  });
});

describe('404 handling', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for unknown POST routes', async () => {
    const res = await request(app).post('/api/doesnotexist').send({});
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Large payload handling', () => {
  it('should reject payloads over 1mb limit', async () => {
    // Generate ~1.5MB payload
    const largeString = 'x'.repeat(1_500_000);
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: '9876543210', role: 'rider', extra: largeString });

    // Express should return 413 Payload Too Large
    expect([400, 413]).toContain(res.status);
  });
});

describe('Invalid JSON handling', () => {
  it('should return 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');

    expect([400, 500]).toContain(res.status);
  });
});
