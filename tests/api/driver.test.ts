/**
 * Driver API Tests
 * Tests for /api/driver/* endpoints
 */

import request from "supertest";
import mongoose from "mongoose";
import { Application } from "express";
import { createApp } from "../../src/app";
import { Driver } from "../../src/models/Driver";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
  generateDriverToken,
  generateRiderToken,
} from "../setup/helpers";

let app: Application;
let driverToken: string;
let driverId: string;
let verifiedDriverToken: string;
let verifiedDriverId: string;

beforeAll(async () => {
  await connectTestDB();
  app = createApp();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearCollections();

  // Create a regular driver (incomplete profile)
  const driver = await Driver.create({
    phone: "9876543211",
    countryCode: "+91",
    accountStatus: "incomplete",
    isActive: true,
  });
  driverId = driver._id.toString();
  driverToken = generateDriverToken(driverId, "9876543211");

  // Create a verified driver with full profile
  const verifiedDriver = await Driver.create({
    phone: "9876543212",
    countryCode: "+91",
    accountStatus: "verified",
    name: "Verified Driver",
    vehicleType: "auto",
    vehicleModel: "Bajaj RE",
    vehicleNumber: "WB01A1234",
    vehicleColor: "Yellow",
    isActive: true,
    isOnline: true,
    isAvailable: true,
    walletBalance: 500,
    location: { type: "Point", coordinates: [88.3639, 22.5726] },
  });
  verifiedDriverId = verifiedDriver._id.toString();
  verifiedDriverToken = generateDriverToken(verifiedDriverId, "9876543212");
});

// ── POST /api/driver/register ──────────────────────────────────────────────────

describe("POST /api/driver/register", () => {
  it("should register driver with valid KYC data", async () => {
    const start = Date.now();
    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "123456789012",
        selfieDocument: "https://example.com/selfie.jpg",
      });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[POST /api/driver/register] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 400 for missing required fields (no aadhaar/license/selfie)", async () => {
    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ name: "John Driver" }); // Missing vehicleType, vehicleModel, vehicleNumber, aadhaarNumber, etc.

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for invalid aadhaar number (not 12 digits)", async () => {
    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "12345", // Invalid — too short
        selfieDocument: "https://example.com/selfie.jpg",
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 409 when Aadhaar number is already registered to another driver", async () => {
    // First driver registers with aadhaarNumber
    const existingDriver = await Driver.create({
      phone: "9876543299",
      countryCode: "+91",
      accountStatus: "pending",
      aadhaarNumber: "999999999999",
      isActive: true,
    });

    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "999999999999", // Duplicate
        selfieDocument: "https://example.com/selfie.jpg",
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    // Error message should be in Bengali
    expect(res.body.message).toMatch(/নিবন্ধিত/);
    await Driver.deleteOne({ _id: existingDriver._id });
  });

  it("should return 409 when Driving Licence is already registered to another driver", async () => {
    await Driver.create({
      phone: "9876543298",
      countryCode: "+91",
      accountStatus: "pending",
      licenseNumber: "DL9999990001",
      isActive: true,
    });

    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL9999990001", // Duplicate
        aadhaarNumber: "123456789012",
        selfieDocument: "https://example.com/selfie.jpg",
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/নিবন্ধিত/);
  });

  it("should return 400 for invalid vehicle type", async () => {
    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "helicopter", // Invalid
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "123456789012",
        selfieDocument: "https://example.com/selfie.jpg",
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 401 without token", async () => {
    const res = await request(app)
      .post("/api/driver/register")
      .send({ name: "John Driver", vehicleType: "auto" });

    expect(res.status).toBe(401);
  });

  it("should return 403 if accessed by rider token", async () => {
    const riderToken = generateRiderToken();
    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ name: "John Driver", vehicleType: "auto" });

    expect(res.status).toBe(403);
  });

  it("should credit the union leader with the referral bonus when a new driver registers with a referral code", async () => {
    const unionLeader = await Driver.create({
      phone: "9876543213",
      countryCode: "+91",
      accountStatus: "verified",
      isUnionLeader: true,
      referralCode: "ULREF1",
      walletBalance: 0,
      totalEarnings: 0,
      rating: 5.0,
      totalRatings: 0,
      totalRides: 0,
      isActive: true,
      isOnline: false,
      isAvailable: false,
    });

    const res = await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "123456789012",
        selfieDocument: "https://example.com/selfie.jpg",
        referralCode: "ULREF1",
      });

    expect(res.status).toBe(200);
    const updatedUnionLeader = await Driver.findById(unionLeader._id);
    expect(updatedUnionLeader?.walletBalance).toBe(300);
  });
});

// ── PATCH /api/driver/activate ─────────────────────────────────────────────────

describe("PATCH /api/driver/activate", () => {
  it("should activate a pending driver once profile and documents are complete", async () => {
    await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "123456789012",
        selfieDocument: "https://example.com/selfie.jpg",
        licenseDocument: "https://example.com/license.jpg",
        vehicleDocument: "https://example.com/vehicle.jpg",
      });

    const res = await request(app)
      .patch("/api/driver/activate")
      .set("Authorization", `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accountStatus).toBe("verified");
  });

  it("should return 400 when licenseDocument/vehicleDocument are missing", async () => {
    await request(app)
      .post("/api/driver/register")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "John Driver",
        vehicleType: "auto",
        vehicleModel: "Bajaj RE",
        vehicleNumber: "WB01A5678",
        licenseNumber: "DL1234560001",
        aadhaarNumber: "123456789012",
        selfieDocument: "https://example.com/selfie.jpg",
        // licenseDocument and vehicleDocument intentionally omitted
      });

    const res = await request(app)
      .patch("/api/driver/activate")
      .set("Authorization", `Bearer ${driverToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 409 if already verified", async () => {
    const res = await request(app)
      .patch("/api/driver/activate")
      .set("Authorization", `Bearer ${verifiedDriverToken}`);

    expect(res.status).toBe(409);
  });
});

// ── GET /api/driver/profile ────────────────────────────────────────────────────

describe("GET /api/driver/profile", () => {
  it("should return driver profile for verified driver", async () => {
    const start = Date.now();
    const res = await request(app)
      .get("/api/driver/profile")
      .set("Authorization", `Bearer ${verifiedDriverToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("phone", "9876543212");
    console.log(
      `[GET /api/driver/profile] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 401 without token", async () => {
    const res = await request(app).get("/api/driver/profile");
    expect(res.status).toBe(401);
  });

  it("should return 403 for rider token", async () => {
    const riderToken = generateRiderToken();
    const res = await request(app)
      .get("/api/driver/profile")
      .set("Authorization", `Bearer ${riderToken}`);
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/driver/online-status ───────────────────────────────────────────

describe("PATCH /api/driver/online-status", () => {
  it("should toggle online status for verified driver", async () => {
    const start = Date.now();
    const res = await request(app)
      .patch("/api/driver/online-status")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ isOnline: false });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[PATCH /api/driver/online-status] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 400 for missing isOnline field", async () => {
    const res = await request(app)
      .patch("/api/driver/online-status")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for non-boolean isOnline", async () => {
    const res = await request(app)
      .patch("/api/driver/online-status")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ isOnline: "yes" });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 403 for unverified driver", async () => {
    const res = await request(app)
      .patch("/api/driver/online-status")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ isOnline: true });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

// ── PATCH /api/driver/location ─────────────────────────────────────────────────

describe("PATCH /api/driver/location", () => {
  it("should update driver location with valid coordinates", async () => {
    const start = Date.now();
    const res = await request(app)
      .patch("/api/driver/location")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ lat: 22.5726, lng: 88.3639 });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[PATCH /api/driver/location] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 400 for missing coordinates", async () => {
    const res = await request(app)
      .patch("/api/driver/location")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for invalid lat/lng range", async () => {
    const res = await request(app)
      .patch("/api/driver/location")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ lat: 999, lng: 999 }); // Out of valid range

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 403 for unverified driver", async () => {
    const res = await request(app)
      .patch("/api/driver/location")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ lat: 22.5, lng: 88.3 });

    expect(res.status).toBe(403);
  });
});

// ── GET /api/driver/rides ──────────────────────────────────────────────────────

describe("GET /api/driver/rides", () => {
  it("should return empty ride history", async () => {
    const start = Date.now();
    const res = await request(app)
      .get("/api/driver/rides")
      .set("Authorization", `Bearer ${verifiedDriverToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    console.log(`[GET /api/driver/rides] status=${res.status} time=${time}ms`);
  });

  it("should return 401 without token", async () => {
    const res = await request(app).get("/api/driver/rides");
    expect(res.status).toBe(401);
  });
});

// ── GET /api/driver/wallet ─────────────────────────────────────────────────────

describe("GET /api/driver/wallet", () => {
  it("should return wallet info for verified driver", async () => {
    const start = Date.now();
    const res = await request(app)
      .get("/api/driver/wallet")
      .set("Authorization", `Bearer ${verifiedDriverToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("walletBalance");
    console.log(`[GET /api/driver/wallet] status=${res.status} time=${time}ms`);
  });
});

// ── POST /api/driver/wallet/recharge ──────────────────────────────────────────

describe("POST /api/driver/wallet/recharge", () => {
  it("should recharge wallet with valid amount", async () => {
    const start = Date.now();
    const res = await request(app)
      .post("/api/driver/wallet/recharge")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ amount: 200 });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[POST /api/driver/wallet/recharge] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 400 for invalid amount (zero)", async () => {
    const res = await request(app)
      .post("/api/driver/wallet/recharge")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ amount: 0 });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for missing amount", async () => {
    const res = await request(app)
      .post("/api/driver/wallet/recharge")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/driver/wallet/recharge-request", () => {
  it("should create a pending recharge request with valid amount and payment reference", async () => {
    const res = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ amount: 500, paymentReference: "1234" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("requestId");
    expect(res.body.data).toHaveProperty("status", "pending");
    expect(res.body.data).toHaveProperty("amount", 500);
  });
});

// ── PUT /api/driver/fcm-token ──────────────────────────────────────────────────

describe("PUT /api/driver/fcm-token", () => {
  it("should update FCM token for driver", async () => {
    const start = Date.now();
    const res = await request(app)
      .put("/api/driver/fcm-token")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ fcmToken: "driver-fcm-token-xyz" });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[PUT /api/driver/fcm-token] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 400 when fcmToken is empty", async () => {
    const res = await request(app)
      .put("/api/driver/fcm-token")
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ fcmToken: "" });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
