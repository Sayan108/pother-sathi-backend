import request from "supertest";
import { Application } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import { User } from "../../src/models/User";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "../setup/helpers";

const mockGoogleIdentity = {
  providerId: "google_oauth_sub_123",
  email: "oauthuser@example.com",
  name: "OAuth User",
  picture: "https://example.com/avatar.png",
  emailVerified: true,
};

const mockGoogleProvider = {
  verify: jest.fn().mockResolvedValue(mockGoogleIdentity),
};

var mockGetToken: jest.Mock;

jest.mock("google-auth-library", () => {
  mockGetToken = jest.fn().mockResolvedValue({
    tokens: { id_token: "mock-google-id-token" },
  });
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      getToken: mockGetToken,
    })),
  };
});

describe("Google OAuth Endpoints", () => {
  let app: Application;
  let identityProviderRegistry: any;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectTestDB();
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI =
      "http://localhost/auth/google/callback";
    const { createApp: loadedCreateApp } = require("../../src/app");
    const googleAuthService = require("../../src/services/google-auth.service");
    identityProviderRegistry = googleAuthService.identityProviderRegistry;
    app = loadedCreateApp();
    identityProviderRegistry.set("google", mockGoogleProvider as any);
  });

  afterAll(async () => {
    await disconnectTestDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  afterEach(async () => {
    await clearCollections();
    mockGoogleProvider.verify.mockClear();
    mockGetToken.mockClear();
  });

  it("should redirect to Google OAuth consent screen with state", async () => {
    const res = await request(app).get("/auth/google");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(
      "accounts.google.com/o/oauth2/v2/auth",
    );
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers.location).toContain("scope=openid+email+profile");
  });

  it("should complete OAuth callback and create a new rider account", async () => {
    const agent = request.agent(app);
    const redirectRes = await agent.get("/auth/google");
    const authUrl = redirectRes.headers.location as string;
    const parsedUrl = new URL(authUrl);
    const state = parsedUrl.searchParams.get("state");

    const res = await agent.get(
      `/auth/google/callback?code=valid-code&state=${encodeURIComponent(
        state || "",
      )}`,
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe("rider");
    expect(res.body.data.isNewUser).toBe(true);
    expect(res.body.data.user.email).toBe(mockGoogleIdentity.email);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(mockGetToken).toHaveBeenCalledWith("valid-code");
    expect(mockGoogleProvider.verify).toHaveBeenCalledWith(
      "mock-google-id-token",
    );
  });

  it("should sign in an existing rider by email and link Google provider", async () => {
    await User.create({
      phone: "9999999999",
      countryCode: "+91",
      email: mockGoogleIdentity.email,
      role: "rider",
      isVerified: true,
      isActive: true,
    });

    const agent = request.agent(app);
    const redirectRes = await agent.get("/auth/google");
    const authUrl = redirectRes.headers.location as string;
    const parsedUrl = new URL(authUrl);
    const state = parsedUrl.searchParams.get("state");

    const res = await agent.get(
      `/auth/google/callback?code=valid-code&state=${encodeURIComponent(
        state || "",
      )}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isNewUser).toBe(false);

    const updatedUser = await User.findOne({ email: mockGoogleIdentity.email });
    expect(updatedUser?.googleId).toBe(mockGoogleIdentity.providerId);
  });
});
