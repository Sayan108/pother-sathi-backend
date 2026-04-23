/**
 * Ride API Tests
 * Tests for /api/rides/* endpoints
 */

import request from "supertest";
import mongoose from "mongoose";
import { Application } from "express";
import { createApp } from "../../src/app";
import { User } from "../../src/models/User";
import { Driver } from "../../src/models/Driver";
import { Ride } from "../../src/models/Ride";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
  generateRiderToken,
  generateDriverToken,
} from "../setup/helpers";

let app: Application;
let riderToken: string;
let riderId: string;
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

  const user = await User.create({
    phone: "9876543210",
    countryCode: "+91",
    isVerified: true,
    name: "Test Rider",
    email: "rider@test.com",
  });
  riderId = user._id.toString();
  riderToken = generateRiderToken(riderId, "9876543210");

  const driver = await Driver.create({
    phone: "9876543212",
    countryCode: "+91",
    accountStatus: "verified",
    name: "Test Driver",
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
  verifiedDriverId = driver._id.toString();
  verifiedDriverToken = generateDriverToken(verifiedDriverId, "9876543212");
});

// ── GET /api/rides/fare-estimate ───────────────────────────────────────────────

describe("GET /api/rides/fare-estimate", () => {
  it("should return fare estimate for valid coordinates and vehicle type", async () => {
    const start = Date.now();
    const res = await request(app)
      .get("/api/rides/fare-estimate")
      .set("Authorization", `Bearer ${riderToken}`)
      .query({
        pickupLat: 22.5726,
        pickupLng: 88.3639,
        dropLat: 22.6,
        dropLng: 88.4,
        vehicleType: "auto",
      });
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[GET /api/rides/fare-estimate] status=${res.status} time=${time}ms`,
    );
  });

  it("should return 401 without token", async () => {
    const res = await request(app).get("/api/rides/fare-estimate").query({
      pickupLat: 22.5726,
      pickupLng: 88.3639,
      dropLat: 22.6,
      dropLng: 88.4,
      vehicleType: "auto",
    });
    expect(res.status).toBe(401);
  });
});

// ── GET /api/rides/active ──────────────────────────────────────────────────────

describe("GET /api/rides/active", () => {
  it("should return null when rider has no active ride", async () => {
    const start = Date.now();
    const res = await request(app)
      .get("/api/rides/active")
      .set("Authorization", `Bearer ${riderToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log(
      `[GET /api/rides/active no ride] status=${res.status} time=${time}ms`,
    );
  });

  it("should return active ride when one exists", async () => {
    // Create an active ride
    await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "1234",
      status: "driver_assigned",
    });

    const res = await request(app)
      .get("/api/rides/active")
      .set("Authorization", `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).not.toBeNull();
  });

  it("should return 401 without token", async () => {
    const res = await request(app).get("/api/rides/active");
    expect(res.status).toBe(401);
  });
});

// ── GET /api/rides/:rideId ─────────────────────────────────────────────────────

describe("GET /api/rides/:rideId", () => {
  it("should return 404 for non-existent ride", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const start = Date.now();
    const res = await request(app)
      .get(`/api/rides/${fakeRideId}`)
      .set("Authorization", `Bearer ${riderToken}`);
    const time = Date.now() - start;

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    console.log(
      `[GET /api/rides/:rideId not found] status=${res.status} time=${time}ms`,
    );
  });

  it("should return ride when rider owns it", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "completed",
    });

    const res = await request(app)
      .get(`/api/rides/${ride._id}`)
      .set("Authorization", `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should return ride when driver owns it", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "completed",
    });

    const res = await request(app)
      .get(`/api/rides/${ride._id}`)
      .set("Authorization", `Bearer ${verifiedDriverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should return 401 without token", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/rides/${fakeRideId}`);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/rides/:rideId/rate ─────────────────────────────────────────────

describe("POST /api/rides/:rideId/rate", () => {
  it("should allow a rider to rate a completed ride and update driver rating", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "completed",
    });

    const res = await request(app)
      .post(`/api/rides/${ride._id}/rate`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ rating: 4, review: "Great rider experience" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedRide = await Ride.findById(ride._id).lean();
    expect(updatedRide?.riderRating).toBe(4);

    const driver = await Driver.findById(verifiedDriverId).lean();
    expect(driver?.rating).toBe(4);
    expect(driver?.totalRatings).toBe(1);
  });

  it("should allow a driver to rate a completed ride and update rider rating", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "completed",
    });

    const res = await request(app)
      .post(`/api/rides/${ride._id}/rate`)
      .set("Authorization", `Bearer ${verifiedDriverToken}`)
      .send({ rating: 5, review: "Excellent rider" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedRide = await Ride.findById(ride._id).lean();
    expect(updatedRide?.driverRating).toBe(5);

    const rider = await User.findById(riderId).lean();
    expect(rider?.rating).toBe(5);
    expect(rider?.totalRatings).toBe(1);
  });

  it("should return 409 when a user tries to rate the same ride twice", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "completed",
      riderRating: 3,
    });

    const res = await request(app)
      .post(`/api/rides/${ride._id}/rate`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ rating: 5, review: "Trying to rate again" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("should return 404 when trying to rate a non-completed or unauthorized ride", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(verifiedDriverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "in_progress",
    });

    const res = await request(app)
      .post(`/api/rides/${ride._id}/rate`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ rating: 5, review: "Trying early rating" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
