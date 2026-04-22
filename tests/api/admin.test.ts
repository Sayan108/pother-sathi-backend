import request from "supertest";
import { Application } from "express";
import { createApp } from "../../src/app";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
  generateAdminToken,
  generateDriverToken,
} from "../setup/helpers";
import { User } from "../../src/models/User";
import { Driver } from "../../src/models/Driver";

let app: Application;
let adminToken: string;
let driverToken: string;
let driverId: string;

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

beforeEach(async () => {
  const admin = await User.create({
    phone: "9876543219",
    countryCode: "+91",
    role: "admin",
    isVerified: true,
    isActive: true,
    walletBalance: 0,
    rating: 5.0,
    totalRatings: 0,
    totalRides: 0,
  });
  adminToken = generateAdminToken(admin._id.toString(), "9876543219");

  const driver = await Driver.create({
    phone: "9876543218",
    countryCode: "+91",
    accountStatus: "verified",
    name: "Approved Driver",
    vehicleType: "auto",
    vehicleModel: "Bajaj RE",
    vehicleNumber: "WB01A9999",
    isActive: true,
    isOnline: true,
    isAvailable: true,
    walletBalance: 500,
    location: { type: "Point", coordinates: [88.3639, 22.5726] },
  });
  driverId = driver._id.toString();
  driverToken = generateDriverToken(driverId, "9876543218");
});

describe("Admin recharge request approval", () => {
  it("should approve a pending recharge request", async () => {
    const requestRes = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amount: 500, paymentReference: "1234" });

    expect(requestRes.status).toBe(200);
    expect(requestRes.body.success).toBe(true);
    const requestId = requestRes.body.data.requestId;

    const approveRes = await request(app)
      .patch(`/api/admin/driver/wallet/recharge-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.walletBalance).toBe(1000);
  });

  it("should reject a pending recharge request", async () => {
    const requestRes = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amount: 200, paymentReference: "5678" });

    expect(requestRes.status).toBe(200);
    const requestId = requestRes.body.data.requestId;

    const rejectRes = await request(app)
      .patch(`/api/admin/driver/wallet/recharge-requests/${requestId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);
    expect(rejectRes.body.data.status).toBe("rejected");
  });

  it("should prevent non-admin users from approving requests", async () => {
    const requestRes = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amount: 300 });

    expect(requestRes.status).toBe(200);
    const requestId = requestRes.body.data.requestId;

    const approveRes = await request(app)
      .patch(`/api/admin/driver/wallet/recharge-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send();

    expect([403, 401]).toContain(approveRes.status);
    expect(approveRes.body.success).toBe(false);
  });
});

describe("Admin driver approvals and wallet control", () => {
  it("should verify a pending driver and credit verification bonus", async () => {
    const pendingDriver = await Driver.create({
      phone: "9876543217",
      countryCode: "+91",
      accountStatus: "pending",
      isActive: true,
      isOnline: false,
      isAvailable: false,
      walletBalance: 0,
      totalEarnings: 0,
      rating: 5.0,
      totalRatings: 0,
      totalRides: 0,
    });

    const verifyRes = await request(app)
      .patch(`/api/admin/drivers/${pendingDriver._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accountStatus).toBe("verified");
    expect(verifyRes.body.data.walletBalance).toBe(3000);
  });

  it("should adjust a driver's wallet using admin wallet control", async () => {
    const adjustRes = await request(app)
      .patch(`/api/admin/drivers/${driverId}/wallet`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "credit", amount: 200, description: "Admin credit" });

    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.success).toBe(true);
    expect(adjustRes.body.data.walletBalance).toBe(700);
  });
});
