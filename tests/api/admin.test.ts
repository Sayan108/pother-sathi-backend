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
import { Ride } from "../../src/models/Ride";
import { BasePrice } from "../../src/models/BasePrice";
import { RechargeRequest } from "../../src/models/RechargeRequest";
import { Banner } from "../../src/models/Banner";

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

  it("should not double-credit an already approved recharge request", async () => {
    const requestRes = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amount: 500, paymentReference: "ONCE-ONLY" });

    const requestId = requestRes.body.data.requestId;

    const first = await request(app)
      .patch(`/api/admin/driver/wallet/recharge-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();
    const second = await request(app)
      .patch(`/api/admin/driver/wallet/recharge-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    const driver = await Driver.findById(driverId).lean();
    expect(driver?.walletBalance).toBe(1000);
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
    const driver = await Driver.findById(driverId).lean();
    expect(driver?.walletBalance).toBe(500);
  });

  it("should preserve payment reference after rejection so it cannot be reused", async () => {
    const recharge = await RechargeRequest.create({
      driverId,
      amount: 100,
      paymentReference: "REJECTED-REF",
      description: "test",
    });
    await request(app)
      .patch(
        `/api/admin/driver/wallet/recharge-requests/${recharge._id}/reject`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "bad proof" });

    const res = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amount: 100, paymentReference: "REJECTED-REF" });

    expect(res.status).toBe(409);
  });

  it("should prevent non-admin users from approving requests", async () => {
    const requestRes = await request(app)
      .post("/api/driver/wallet/recharge-request")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amount: 300, paymentReference: "NONADMIN-REF" });

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
  it("should create and list user banners using a Cloudinary URL", async () => {
    const createRes = await request(app)
      .post("/api/admin/banners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "User Promo",
        imageUrl:
          "https://res.cloudinary.com/demo/image/upload/v123/pothersathi/banner.jpg",
        linkUrl: "https://example.com/promo",
        audience: "user",
        isActive: true,
        sortOrder: 1,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.banner).toMatchObject({
      title: "User Promo",
      audience: "user",
      status: "active",
      isActive: true,
      sortOrder: 1,
    });

    const listRes = await request(app)
      .get("/api/admin/banners?audience=user")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.banners).toHaveLength(1);
    expect(listRes.body.data.banners[0].imageUrl).toContain(
      "res.cloudinary.com",
    );
  });

  it("should reject banner image URLs that are not from Cloudinary", async () => {
    const res = await request(app)
      .post("/api/admin/banners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Bad Banner",
        imageUrl: "https://example.com/banner.jpg",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Cloudinary URL/i);
  });

  it("should enforce a maximum of 10 user banners", async () => {
    await Banner.insertMany(
      Array.from({ length: 10 }).map((_, index) => ({
        title: `Banner ${index + 1}`,
        imageUrl: `https://res.cloudinary.com/demo/image/upload/v123/banner-${index + 1}.jpg`,
        audience: "user",
        status: "active",
        isActive: true,
        sortOrder: index + 1,
      })),
    );

    const res = await request(app)
      .post("/api/admin/banners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Overflow Banner",
        imageUrl:
          "https://res.cloudinary.com/demo/image/upload/v123/overflow.jpg",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("10 user banners");
  });

  it("should update banner status and soft delete banners", async () => {
    const banner = await Banner.create({
      title: "Toggle Banner",
      imageUrl: "https://res.cloudinary.com/demo/image/upload/v123/toggle.jpg",
      audience: "user",
      status: "active",
      isActive: true,
      sortOrder: 1,
    });

    const pauseRes = await request(app)
      .patch(`/api/admin/banners/${banner._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.banner.status).toBe("inactive");
    expect(pauseRes.body.data.banner.isActive).toBe(false);

    const deleteRes = await request(app)
      .delete(`/api/admin/banners/${banner._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    const deleted = await Banner.findById(banner._id).lean();
    expect(deleted?.isDeleted).toBe(true);
    expect(deleted?.status).toBe("inactive");
  });

  it("should expose only active non-deleted user banners publicly", async () => {
    await Banner.insertMany([
      {
        title: "Visible",
        imageUrl:
          "https://res.cloudinary.com/demo/image/upload/v123/visible.jpg",
        audience: "user",
        status: "active",
        isActive: true,
        sortOrder: 1,
      },
      {
        title: "Paused",
        imageUrl: "https://res.cloudinary.com/demo/image/upload/v123/paused.jpg",
        audience: "user",
        status: "inactive",
        isActive: false,
        sortOrder: 2,
      },
      {
        title: "Driver Banner",
        imageUrl: "https://res.cloudinary.com/demo/image/upload/v123/driver.jpg",
        audience: "driver",
        status: "active",
        isActive: true,
        sortOrder: 3,
      },
    ]);

    const res = await request(app).get("/api/banners/user");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.banners).toHaveLength(1);
    expect(res.body.data.banners[0].title).toBe("Visible");
  });

  it("should process a push notification for a selected rider", async () => {
    const rider = await User.create({
      phone: "9876500001",
      countryCode: "+91",
      role: "rider",
      name: "Push Rider",
      isVerified: true,
      isActive: true,
      fcmToken: "rider-token-1",
      fcmTokens: ["rider-token-1"],
    });

    const res = await request(app)
      .post("/api/admin/notifications")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        recipientType: "rider",
        recipientId: rider._id.toString(),
        title: "Hello",
        body: "Your ride update",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      recipientCount: 1,
      onlineCount: 0,
      socketDeliveredCount: 0,
      fcmConfigured: false,
      fcmTokenCount: 1,
      fcmSuccessCount: 0,
      deliveredCount: 0,
      event: "admin:notification",
    });
  });

  it("should require a recipient id for single-user notifications", async () => {
    const res = await request(app)
      .post("/api/admin/notifications")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        recipientType: "rider",
        title: "Hello",
        body: "Missing recipient",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should list rides for the admin dashboard", async () => {
    const rider = await User.create({
      phone: "9876543215",
      countryCode: "+91",
      role: "rider",
      name: "Test Rider",
      isVerified: true,
      walletBalance: 100,
    });

    await Ride.create({
      riderId: rider._id,
      driverId,
      pickup: { lat: 22.5726, lng: 88.3639, address: "Pickup" },
      drop: { lat: 22.58, lng: 88.37, address: "Drop" },
      vehicleType: "auto",
      status: "completed",
      fare: 120,
      platformFee: 18,
      driverEarning: 102,
      discount: 0,
      paymentMethod: "cash",
      isPaid: true,
      otp: "1234",
    });

    const res = await request(app)
      .get("/api/admin/rides?page=1&limit=20")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rides).toHaveLength(1);
    expect(res.body.data.rides[0]).toMatchObject({
      vehicleType: "auto",
      status: "completed",
      fare: 120,
    });
    expect(res.body.data.rides[0].riderId).toMatchObject({
      phone: "9876543215",
      name: "Test Rider",
    });
  });

  it("should manage base prices for the admin dashboard", async () => {
    const listRes = await request(app)
      .get("/api/admin/base-prices")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.basePrices.length).toBeGreaterThan(0);

    const createRes = await request(app)
      .post("/api/admin/base-prices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        vehicleType: "auto",
        basePrice: 35,
        pricePerKm: 16,
        minimumFare: 75,
        isActive: true,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.basePrice).toMatchObject({
      vehicleType: "auto",
      basePrice: 35,
      pricePerKm: 16,
      minimumFare: 75,
      isActive: true,
    });

    const updateRes = await request(app)
      .put("/api/admin/base-prices/auto")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ basePrice: 40 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.basePrice).toMatchObject({
      vehicleType: "auto",
      basePrice: 40,
    });

    const saved = await BasePrice.findOne({ vehicleType: "auto" }).lean();
    expect(saved?.basePrice).toBe(40);
  });

  it("should list drivers for the admin dashboard", async () => {
    const res = await request(app)
      .get("/api/admin/drivers?page=1&limit=1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.drivers).toHaveLength(1);
    expect(res.body.data.drivers[0]).toMatchObject({
      phone: "9876543218",
      name: "Approved Driver",
      kycDocuments: {},
    });
    expect(res.body.meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it("should list riders for the admin dashboard", async () => {
    await User.create({
      phone: "9876543215",
      countryCode: "+91",
      role: "rider",
      name: "Test Rider",
      isVerified: true,
      walletBalance: 100,
    });

    const res = await request(app)
      .get("/api/admin/riders?page=1&limit=20")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.riders).toHaveLength(1);
    expect(res.body.data.riders[0]).toMatchObject({
      phone: "9876543215",
      role: "rider",
      name: "Test Rider",
    });
  });

  it("should list union leaders for the admin dashboard", async () => {
    await Driver.findByIdAndUpdate(driverId, {
      $set: {
        isUnionLeader: true,
        referralCode: "LEADER01",
        referralCount: 2,
      },
    });

    const res = await request(app)
      .get("/api/admin/leaders?page=1&limit=20")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.leaders).toHaveLength(1);
    expect(res.body.data.leaders[0]).toMatchObject({
      phone: "9876543218",
      isUnionLeader: true,
      referralCode: "LEADER01",
      referralCount: 2,
    });
  });

  it("should return KYC documents with pending drivers", async () => {
    await Driver.create({
      phone: "9876543216",
      countryCode: "+91",
      accountStatus: "pending",
      kycStatus: "pending",
      name: "Pending Driver",
      email: "pending@example.com",
      vehicleType: "bike",
      vehicleModel: "Honda Shine",
      vehicleNumber: "WB12AB1234",
      vehicleColor: "Black",
      vehicleYear: "2024",
      serviceArea: "Kolkata",
      aadhaarNumber: "123456789012",
      licenseNumber: "WB0120230001234",
      aadhaarDocument: "https://example.com/aadhaar.jpg",
      licenseDocument: "https://example.com/license.jpg",
      selfieDocument: "https://example.com/selfie.jpg",
      vehicleDocument: "https://example.com/vehicle.jpg",
      licenseExpiry: new Date("2030-12-31"),
      isActive: true,
      walletBalance: 0,
    });

    const res = await request(app)
      .get("/api/admin/drivers/kyc/pending")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.drivers).toHaveLength(1);
    expect(res.body.data.drivers[0]).toMatchObject({
      name: "Pending Driver",
      email: "pending@example.com",
      aadhaarDocument: "https://example.com/aadhaar.jpg",
      licenseDocument: "https://example.com/license.jpg",
      selfieDocument: "https://example.com/selfie.jpg",
      vehicleDocument: "https://example.com/vehicle.jpg",
      kycDocuments: {
        aadhaarDocument: "https://example.com/aadhaar.jpg",
        licenseDocument: "https://example.com/license.jpg",
        selfieDocument: "https://example.com/selfie.jpg",
        vehicleDocument: "https://example.com/vehicle.jpg",
      },
    });
  });

  it("should return full KYC details for a driver", async () => {
    const pendingDriver = await Driver.create({
      phone: "9876543214",
      countryCode: "+91",
      accountStatus: "pending",
      kycStatus: "pending",
      name: "KYC Detail Driver",
      email: "kyc-detail@example.com",
      vehicleType: "bike",
      vehicleModel: "Honda Shine",
      vehicleNumber: "WB12CD1234",
      vehicleColor: "Black",
      vehicleYear: "2024",
      serviceArea: "Kolkata",
      aadhaarNumber: "123456789013",
      licenseNumber: "WB0120230001235",
      aadhaarDocument: "https://example.com/detail-aadhaar.jpg",
      licenseDocument: "https://example.com/detail-license.jpg",
      selfieDocument: "https://example.com/detail-selfie.jpg",
      vehicleDocument: "https://example.com/detail-vehicle.jpg",
      licenseExpiry: new Date("2030-12-31"),
      isActive: true,
      walletBalance: 0,
    });

    const res = await request(app)
      .get(`/api/admin/drivers/${pendingDriver._id}/kyc`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.driver).toMatchObject({
      name: "KYC Detail Driver",
      aadhaarNumber: "123456789013",
      licenseNumber: "WB0120230001235",
      kycDocuments: {
        aadhaarDocument: "https://example.com/detail-aadhaar.jpg",
        licenseDocument: "https://example.com/detail-license.jpg",
        selfieDocument: "https://example.com/detail-selfie.jpg",
        vehicleDocument: "https://example.com/detail-vehicle.jpg",
      },
      kycDetails: {
        aadhaarNumber: "123456789013",
        licenseNumber: "WB0120230001235",
        status: "pending",
      },
    });
  });

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

    // Verify the driver is also set to active
    const updatedDriver = await Driver.findById(pendingDriver._id);
    expect(updatedDriver?.isVerified).toBe(true);
    expect(updatedDriver?.isActive).toBe(true);
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

  it("should ban and unban a driver through the admin update endpoint", async () => {
    const banRes = await request(app)
      .patch(`/api/admin/drivers/${driverId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "ban",
        banned: true,
        isBanned: true,
        blocked: true,
        accountStatus: "banned",
        status: "banned",
        reason: "Banned by admin",
      });

    expect(banRes.status).toBe(200);
    expect(banRes.body.success).toBe(true);
    expect(banRes.body.data.user.isBanned).toBe(true);
    expect(banRes.body.data.user.accountStatus).toBe("banned");

    const unbanRes = await request(app)
      .put(`/api/admin/drivers/${driverId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "unban",
        banned: false,
        isBanned: false,
        blocked: false,
        accountStatus: "active",
        status: "active",
        reason: "Unbanned by admin",
      });

    expect(unbanRes.status).toBe(200);
    expect(unbanRes.body.success).toBe(true);
    expect(unbanRes.body.data.user.isBanned).toBe(false);
    expect(unbanRes.body.data.user.accountStatus).toBe("active");
  });

  it("should soft delete a rider through the admin delete endpoint", async () => {
    const rider = await User.create({
      phone: "9876543210",
      countryCode: "+91",
      role: "rider",
      name: "Delete Me",
      isVerified: true,
      isActive: true,
    });

    const deleteRes = await request(app)
      .delete(`/api/admin/riders/${rider._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const deletedRider = await User.findById(rider._id).lean();
    expect(deletedRider?.isDeleted).toBe(true);
    expect(deletedRider?.deletedAt).toBeDefined();

    const listRes = await request(app)
      .get("/api/admin/riders?page=1&limit=20")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.riders).toHaveLength(0);
  });
});
