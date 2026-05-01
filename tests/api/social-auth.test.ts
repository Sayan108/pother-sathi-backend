/**
 * Social Auth API Tests
 * Tests for POST /api/auth/social-login and POST /api/auth/driver/google-login
 *
 * NOTE: Google token verification is mocked in these tests since real Google
 * tokens cannot be generated in a test environment.  The mock is applied by
 * monkey-patching the identityProviderRegistry used by the controllers.
 */

import request from "supertest";
import { Application } from "express";
import { createApp } from "../../src/app";
import { User } from "../../src/models/User";
import { Driver } from "../../src/models/Driver";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "../setup/helpers";
import { identityProviderRegistry } from "../../src/services/google-auth.service";

let app: Application;

// ── Mock Google provider ───────────────────────────────────────────────────────

const mockGoogleIdentity = {
  providerId: "google_sub_12345",
  email: "testuser@gmail.com",
  name: "Test User",
  picture: "https://example.com/avatar.jpg",
  emailVerified: true,
};

const mockGoogleProvider = {
  verify: jest.fn().mockResolvedValue(mockGoogleIdentity),
};

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  await connectTestDB();
  app = createApp();
  // Replace real Google provider with mock
  identityProviderRegistry.set("google", mockGoogleProvider as any);
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
  mockGoogleProvider.verify.mockResolvedValue(mockGoogleIdentity);
});

// ── POST /api/auth/social-login ────────────────────────────────────────────────

describe("POST /api/auth/social-login — rider Google Sign-In", () => {
  it("should create a new rider account and return tokens on first Google sign-in", async () => {
    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-google-token", provider: "google" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.role).toBe("rider");
    expect(res.body.data.isNewUser).toBe(true);
    expect(res.body.data.user).toHaveProperty(
      "email",
      "testuser@gmail.com",
    );
  });

  it("should return 200 and login an existing rider on subsequent Google sign-in", async () => {
    // Create first
    await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-google-token", provider: "google" });

    // Login again
    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-google-token", provider: "google" });

    expect(res.status).toBe(200);
    expect(res.body.data.isNewUser).toBe(false);
    expect(res.body.data).toHaveProperty("accessToken");
  });

  it("should return 401 when the Google token is invalid", async () => {
    mockGoogleProvider.verify.mockRejectedValueOnce(
      new Error("Invalid or expired Google token"),
    );

    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "bad-token", provider: "google" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should return 422 for missing idToken", async () => {
    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ provider: "google" });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 422 for unsupported provider", async () => {
    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-token", provider: "twitter" });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should track deviceId and return existing account for same device", async () => {
    // First sign-in with deviceId
    await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-google-token", provider: "google", deviceId: "device-abc" });

    // Different Google account, same device
    mockGoogleProvider.verify.mockResolvedValueOnce({
      providerId: "google_sub_different",
      email: "other@gmail.com",
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-google-token-2", provider: "google", deviceId: "device-abc" });

    // Should return the first account (same device)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should link Google ID to existing account found by email", async () => {
    // Pre-create a user with matching email (phone-based registration)
    const existingUser = await User.create({
      phone: "9876543222",
      countryCode: "+91",
      email: "testuser@gmail.com", // Same email as mock Google identity
      role: "rider",
      isVerified: true,
      isActive: true,
    });

    const res = await request(app)
      .post("/api/auth/social-login")
      .send({ idToken: "mock-google-token", provider: "google" });

    expect(res.status).toBe(200); // Existing user, not new
    expect(res.body.data.isNewUser).toBe(false);

    const updated = await User.findById(existingUser._id);
    expect(updated?.googleId).toBe("google_sub_12345");
  });
});

// ── POST /api/auth/driver/google-login ────────────────────────────────────────

describe("POST /api/auth/driver/google-login — Driver Google Sign-In", () => {
  it("should create a new driver stub on first Google sign-in", async () => {
    const res = await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-driver-google-token" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.role).toBe("driver");
    expect(res.body.data.isNewDriver).toBe(true);
    expect(res.body.data.driver).toHaveProperty("kycRequired", true);
    expect(res.body.data.driver.accountStatus).toBe("incomplete");
  });

  it("should return 200 on subsequent driver Google sign-in", async () => {
    await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-driver-google-token" });

    const res = await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-driver-google-token" });

    expect(res.status).toBe(200);
    expect(res.body.data.isNewDriver).toBe(false);
    expect(res.body.data).toHaveProperty("accessToken");
  });

  it("should block same device from registering multiple driver accounts", async () => {
    // First sign-in with deviceId
    await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-driver-google-token", deviceId: "driver-device-xyz" });

    // Different Google account on same device
    mockGoogleProvider.verify.mockResolvedValueOnce({
      providerId: "google_sub_different_driver",
      email: "driver2@gmail.com",
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-token-2", deviceId: "driver-device-xyz" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("should return 401 for invalid Google token", async () => {
    mockGoogleProvider.verify.mockRejectedValueOnce(
      new Error("Invalid or expired Google token"),
    );

    const res = await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "bad-token" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should return 422 for missing idToken", async () => {
    const res = await request(app)
      .post("/api/auth/driver/google-login")
      .send({});

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("should return 403 for a suspended driver", async () => {
    // Create the driver first
    await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-driver-google-token" });

    // Suspend the driver
    await Driver.findOneAndUpdate(
      { googleId: mockGoogleIdentity.providerId },
      { accountStatus: "suspended" },
    );

    const res = await request(app)
      .post("/api/auth/driver/google-login")
      .send({ idToken: "mock-driver-google-token" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
