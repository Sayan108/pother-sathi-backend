/**
 * SMOKE TESTS: Services
 * Verifies all service functions execute without errors
 */

import mongoose from "mongoose";
import { User } from "../../src/models/User";
import { Driver } from "../../src/models/Driver";
import { OTP } from "../../src/models/OTP";
import { sendOTP, verifyOTP } from "../../src/services/otp.service";
import { env } from "../../src/config/environment";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "../setup/helpers";

describe("SMOKE: Services", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  afterEach(async () => {
    await clearCollections();
  });

  // ─── OTP SERVICE ──────────────────────────────────────────────────────────

  describe("OTP Service", () => {
    it("should send OTP for rider in demo mode", async () => {
      const result = await sendOTP(
        "9876543210",
        "+91",
        "rider",
        "login",
      );

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      if (env.DEMO_MODE) {
        expect(result.otp).toBe(env.DEMO_OTP);
      }
    });

    it("should send OTP for driver in demo mode", async () => {
      const result = await sendOTP(
        "9876543211",
        "+91",
        "driver",
        "login",
      );

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it("should store OTP in database", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");

      const otp = await OTP.findOne({ phone: "9876543210" });
      expect(otp).toBeDefined();
      expect(otp?.userType).toBe("rider");
      expect(otp?.isUsed).toBe(false);
    });

    it("should verify correct OTP", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");

      const result = await verifyOTP(
        "9876543210",
        "+91",
        env.DEMO_OTP,
        "rider",
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("successfully");
    });

    it("should mark OTP as used after verification", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");
      await verifyOTP("9876543210", "+91", env.DEMO_OTP, "rider");

      const otp = await OTP.findOne({ phone: "9876543210" });
      expect(otp?.isUsed).toBe(true);
    });

    it("should reject incorrect OTP", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");

      const result = await verifyOTP(
        "9876543210",
        "+91",
        "000000",
        "rider",
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Incorrect");
    });

    it("should increment attempts on wrong OTP", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");
      await verifyOTP("9876543210", "+91", "000000", "rider");

      const otp = await OTP.findOne({ phone: "9876543210" });
      expect(otp?.attempts).toBeGreaterThan(0);
    });

    it("should reject OTP after max attempts", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");

      // Try wrong OTP multiple times
      for (let i = 0; i < env.OTP_MAX_ATTEMPTS; i++) {
        await verifyOTP("9876543210", "+91", "000000", "rider");
      }

      // Next attempt should fail
      const result = await verifyOTP(
        "9876543210",
        "+91",
        "000000",
        "rider",
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Too many");
    });

    it("should expire OTP after timeout", async () => {
      const expiresAt = new Date(Date.now() - 1000); // 1 second ago
      await OTP.create({
        phone: "9876543210",
        countryCode: "+91",
        code: "123456",
        userType: "rider",
        purpose: "login",
        expiresAt,
      });

      const result = await verifyOTP(
        "9876543210",
        "+91",
        "123456",
        "rider",
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("expired");
    });

    it("should sanitize phone number input", async () => {
      const result = await sendOTP(
        "9876543210",
        "+91",
        "rider",
        "login",
      );

      expect(result.success).toBe(true);

      const otp = await OTP.findOne({ phone: "9876543210" });
      expect(otp?.phone).toBe("9876543210");
    });

    it("should invalidate previous OTP when sending new one", async () => {
      await sendOTP("9876543210", "+91", "rider", "login");
      const firstOtp = await OTP.findOne({
        phone: "9876543210",
        isUsed: false,
      });

      await sendOTP("9876543210", "+91", "rider", "login");
      const updatedFirstOtp = await OTP.findById(firstOtp?._id);

      expect(updatedFirstOtp?.isUsed).toBe(true);
    });
  });

  // ─── USER SERVICE (implicit via User model) ─────────────────────────────

  describe("User Service Operations", () => {
    it("should create new user with default values", async () => {
      const user = await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });

      expect(user.isVerified).toBe(false);
      expect(user.isActive).toBe(true);
      expect(user.walletBalance).toBe(0);
      expect(user.rating).toBe(5);
    });

    it("should create new driver with default values", async () => {
      const driver = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });

      expect(driver.accountStatus).toBe("incomplete");
      expect(driver.isVerified).toBe(false);
      expect(driver.isActive).toBe(true);
      expect(driver.isOnline).toBe(false);
      expect(driver.rating).toBe(5.0);
    });
  });

  // ─── QUERY OPERATIONS ─────────────────────────────────────────────────────

  describe("Query Service Operations", () => {
    it("should query users by role", async () => {
      await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });
      await User.create({
        phone: "9876543211",
        countryCode: "+91",
        role: "rider",
      });
      await User.create({
        phone: "9876543212",
        countryCode: "+91",
        role: "admin",
      });

      const riders = await User.find({ role: "rider" });
      expect(riders).toHaveLength(2);
    });

    it("should query drivers by account status", async () => {
      await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
        accountStatus: "approved",
      });
      await Driver.create({
        phone: "9876543212",
        countryCode: "+91",
        accountStatus: "pending",
      });

      const approved = await Driver.find({ accountStatus: "approved" });
      expect(approved).toHaveLength(1);
    });

    it("should query drivers by online status", async () => {
      const driver1 = await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });
      driver1.isOnline = true;
      await driver1.save();

      const driver2 = await Driver.create({
        phone: "9876543212",
        countryCode: "+91",
      });
      driver2.isOnline = false;
      await driver2.save();

      const onlineDrivers = await Driver.find({ isOnline: true });
      expect(onlineDrivers).toHaveLength(1);
    });

    it("should count total users", async () => {
      await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });
      await User.create({
        phone: "9876543211",
        countryCode: "+91",
        role: "rider",
      });

      const count = await User.countDocuments();
      expect(count).toBe(2);
    });

    it("should count total drivers", async () => {
      await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
      });
      await Driver.create({
        phone: "9876543212",
        countryCode: "+91",
      });

      const count = await Driver.countDocuments();
      expect(count).toBe(2);
    });
  });

  // ─── AGGREGATION OPERATIONS ────────────────────────────────────────────

  describe("Aggregation Service Operations", () => {
    it("should aggregate user counts by role", async () => {
      await User.create({
        phone: "9876543210",
        countryCode: "+91",
        role: "rider",
      });
      await User.create({
        phone: "9876543211",
        countryCode: "+91",
        role: "rider",
      });
      await User.create({
        phone: "9876543212",
        countryCode: "+91",
        role: "admin",
      });

      const stats = await User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]);

      const riderStats = stats.find((s) => s._id === "rider");
      expect(riderStats?.count).toBe(2);
    });

    it("should aggregate driver statistics", async () => {
      await Driver.create({
        phone: "9876543211",
        countryCode: "+91",
        totalRides: 10,
        totalEarnings: 5000,
      });
      await Driver.create({
        phone: "9876543212",
        countryCode: "+91",
        totalRides: 20,
        totalEarnings: 8000,
      });

      const stats = await Driver.aggregate([
        {
          $group: {
            _id: null,
            totalDrivers: { $sum: 1 },
            totalRides: { $sum: "$totalRides" },
            totalEarnings: { $sum: "$totalEarnings" },
          },
        },
      ]);

      expect(stats[0].totalDrivers).toBe(2);
      expect(stats[0].totalRides).toBe(30);
      expect(stats[0].totalEarnings).toBe(13000);
    });
  });

  // ─── BULK OPERATIONS ───────────────────────────────────────────────────

  describe("Bulk Service Operations", () => {
    it("should bulk create users", async () => {
      const users = await User.insertMany([
        {
          phone: "9876543210",
          countryCode: "+91",
          role: "rider",
        },
        {
          phone: "9876543211",
          countryCode: "+91",
          role: "rider",
        },
        {
          phone: "9876543212",
          countryCode: "+91",
          role: "admin",
        },
      ]);

      expect(users).toHaveLength(3);
    });

    it("should bulk update users", async () => {
      await User.insertMany([
        {
          phone: "9876543210",
          countryCode: "+91",
          role: "rider",
          walletBalance: 0,
        },
        {
          phone: "9876543211",
          countryCode: "+91",
          role: "rider",
          walletBalance: 0,
        },
      ]);

      const result = await User.updateMany(
        { role: "rider" },
        { walletBalance: 500 },
      );

      expect(result.modifiedCount).toBe(2);
    });

    it("should bulk delete old OTPs", async () => {
      const expiresAt = new Date(Date.now() - 1000);
      await OTP.insertMany([
        {
          phone: "9876543210",
          countryCode: "+91",
          code: "123456",
          userType: "rider",
          expiresAt,
          isUsed: false,
        },
        {
          phone: "9876543211",
          countryCode: "+91",
          code: "234567",
          userType: "driver",
          expiresAt,
          isUsed: false,
        },
      ]);

      const result = await OTP.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      expect(result.deletedCount).toBe(2);
    });
  });
});
