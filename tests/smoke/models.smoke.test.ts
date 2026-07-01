/**
 * SMOKE TESTS: Data Models
 * Verifies all models can be created, read, updated, and deleted
 */

import mongoose from "mongoose";
import { User } from "../../src/models/User";
import { Driver } from "../../src/models/Driver";
import { Ride } from "../../src/models/Ride";
import { OTP } from "../../src/models/OTP";
import { Transaction } from "../../src/models/Transaction";
import { RechargeRequest } from "../../src/models/RechargeRequest";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "../setup/helpers";

describe("SMOKE: Models", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  afterEach(async () => {
    await clearCollections();
  });

  // ─── USER MODEL ────────────────────────────────────────────────────────────

  describe("User Model", () => {
    it("should create a rider user successfully", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
        isVerified: true,
        walletBalance: 1000,
      });

      expect(user).toHaveProperty("_id");
      expect(user.phone).toBe("9876543210");
      expect(user.role).toBe("rider");
      expect(user.walletBalance).toBe(1000);
    });

    it("should find user by phone", async () => {
      await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      const found = await User.findByPhone("9876543210", "+91");
      expect(found).toBeDefined();
      expect(found?.phone).toBe("9876543210");
    });

    it("should hash password on save", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "admin",
        password: "TestPassword123!",
      });

      expect(user.password).not.toBe("TestPassword123!");
      const isMatch = await user.comparePassword("TestPassword123!");
      expect(isMatch).toBe(true);
    });

    it("should return false for incorrect password", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "admin",
        password: "TestPassword123!",
      });

      const isMatch = await user.comparePassword("WrongPassword");
      expect(isMatch).toBe(false);
    });

    it("should update user fields", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      user.name = "John Doe";
      user.email = "john@example.com";
      await user.save();

      const updated = await User.findById(user._id);
      expect(updated?.name).toBe("John Doe");
      expect(updated?.email).toBe("john@example.com");
    });

    it("should delete user", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      await User.deleteOne({ _id: user._id });
      const found = await User.findById(user._id);
      expect(found).toBeNull();
    });
  });

  // ─── DRIVER MODEL ──────────────────────────────────────────────────────────

  describe("Driver Model", () => {
    it("should create a driver successfully", async () => {
      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
        accountStatus: "incomplete",
        walletBalance: 0,
      });

      expect(driver).toHaveProperty("_id");
      expect(driver.phone).toBe("9876543211");
      expect(driver.accountStatus).toBe("incomplete");
      expect(driver.rating).toBe(5.0);
      expect(driver.isOnline).toBe(false);
    });

    it("should find driver by phone", async () => {
      await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      const found = await Driver.findByPhone("9876543211", "+91");
      expect(found).toBeDefined();
      expect(found?.phone).toBe("9876543211");
    });

    it("should update driver status", async () => {
      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      driver.accountStatus = "approved";
      driver.isOnline = true;
      await driver.save();

      const updated = await Driver.findById(driver._id);
      expect(updated?.accountStatus).toBe("approved");
      expect(updated?.isOnline).toBe(true);
    });

    it("should update driver location", async () => {
      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      driver.location = {
        type: "Point",
        coordinates: [88.3639, 22.5431],
      };
      await driver.save();

      const updated = await Driver.findById(driver._id);
      expect(updated?.location?.coordinates).toEqual([88.3639, 22.5431]);
    });
  });

  // ─── RIDE MODEL ───────────────────────────────────────────────────────────

  describe("Ride Model", () => {
    it("should create a ride successfully", async () => {
      const rider = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      const ride = await Ride.create({
        riderId: rider._id,
        driverId: driver._id,
        pickup: {
          lat: 22.5431,
          lng: 88.3639,
          address: "Pickup Point",
        },
        drop: {
          lat: 22.5532,
          lng: 88.3740,
          address: "Drop Point",
        },
        vehicleType: "auto",
        fare: 150,
        otp: "1234",
        status: "accepted",
      });

      expect(ride).toHaveProperty("_id");
      expect(ride.riderId).toEqual(rider._id);
      expect(ride.driverId).toEqual(driver._id);
      expect(ride.fare).toBe(150);
    });

    it("should update ride status", async () => {
      const rider = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      const ride = await Ride.create({
        riderId: rider._id,
        driverId: driver._id,
        pickup: {
          lat: 22.5431,
          lng: 88.3639,
        },
        drop: {
          lat: 22.5532,
          lng: 88.3740,
        },
        vehicleType: "auto",
        fare: 150,
        otp: "1234",
        status: "accepted",
      });

      ride.status = "in_progress";
      await ride.save();

      const updated = await Ride.findById(ride._id);
      expect(updated?.status).toBe("in_progress");
    });
  });

  // ─── OTP MODEL ────────────────────────────────────────────────────────────

  describe("OTP Model", () => {
    it("should create OTP record successfully", async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const otp = await OTP.create({
        phone: "9876543210",
        countryCode: "+91",
        code: "123456",
        userType: "rider",
        purpose: "login",
        expiresAt,
      });

      expect(otp).toHaveProperty("_id");
      expect(otp.phone).toBe("9876543210");
      expect(otp.code).toBe("123456");
      expect(otp.isUsed).toBe(false);
      expect(otp.attempts).toBe(0);
    });

    it("should mark OTP as used", async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const otp = await OTP.create({
        phone: "9876543210",
        countryCode: "+91",
        code: "123456",
        userType: "rider",
        expiresAt,
      });

      otp.isUsed = true;
      await otp.save();

      const updated = await OTP.findById(otp._id);
      expect(updated?.isUsed).toBe(true);
    });

    it("should increment OTP attempts", async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const otp = await OTP.create({
        phone: "9876543210",
        countryCode: "+91",
        code: "123456",
        userType: "rider",
        expiresAt,
      });

      await OTP.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      const updated = await OTP.findById(otp._id);
      expect(updated?.attempts).toBe(1);
    });
  });

  // ─── TRANSACTION MODEL ────────────────────────────────────────────────────

  describe("Transaction Model", () => {
    it("should create transaction successfully", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
        walletBalance: 1000,
      });

      const transaction = await Transaction.create({
        userId: user._id,
        userModel: "User",
        type: "wallet_recharge",
        amount: 500,
        balanceBefore: 1000,
        balanceAfter: 1500,
        description: "Wallet recharge",
        status: "completed",
      });

      expect(transaction).toHaveProperty("_id");
      expect(transaction.userId).toEqual(user._id);
      expect(transaction.amount).toBe(500);
      expect(transaction.status).toBe("completed");
    });

    it("should list transactions for user", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      await Transaction.create({
        userId: user._id,
        userModel: "User",
        type: "wallet_recharge",
        amount: 500,
        balanceBefore: 0,
        balanceAfter: 500,
        description: "Wallet recharge",
        status: "completed",
      });

      const transactions = await Transaction.find({ userId: user._id });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].amount).toBe(500);
    });
  });

  // ─── RECHARGE REQUEST MODEL ──────────────────────────────────────────────

  describe("RechargeRequest Model", () => {
    it("should create recharge request successfully", async () => {
      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      const request = await RechargeRequest.create({
        driverId: driver._id,
        amount: 500,
        paymentReference: "UPI-REF-001",
        description: "Driver wallet recharge",
        purpose: "wallet_recharge",
        status: "pending",
      });

      expect(request).toHaveProperty("_id");
      expect(request.driverId).toEqual(driver._id);
      expect(request.amount).toBe(500);
      expect(request.status).toBe("pending");
    });

    it("should approve recharge request", async () => {
      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      const request = await RechargeRequest.create({
        driverId: driver._id,
        amount: 500,
        paymentReference: "UPI-REF-002",
        description: "Driver wallet recharge",
        purpose: "wallet_recharge",
        status: "pending",
      });

      request.status = "approved";
      await request.save();

      const updated = await RechargeRequest.findById(request._id);
      expect(updated?.status).toBe("approved");
    });
  });
});
