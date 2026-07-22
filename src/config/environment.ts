import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),

  // MongoDB
  MONGODB_URI: required("MONGODB_URI"),

  // JWT
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  // SMS provider (Message Central VerifyNow)
  MESSAGE_CENTRAL_API_URL: process.env.MESSAGE_CENTRAL_API_URL || "",
  MESSAGE_CENTRAL_AUTH_TOKEN: process.env.MESSAGE_CENTRAL_AUTH_TOKEN || "",
  MESSAGE_CENTRAL_API_KEY: process.env.MESSAGE_CENTRAL_API_KEY || "",
  MESSAGE_CENTRAL_SENDER_ID: process.env.MESSAGE_CENTRAL_SENDER_ID || "",
  MESSAGE_CENTRAL_API_KEY_HEADER_NAME:
    process.env.MESSAGE_CENTRAL_API_KEY_HEADER_NAME || "Authorization",
  MESSAGE_CENTRAL_API_KEY_PREFIX:
    process.env.MESSAGE_CENTRAL_API_KEY_PREFIX || "Bearer ",
  MESSAGE_CENTRAL_CUSTOMER_ID: process.env.MESSAGE_CENTRAL_CUSTOMER_ID || "",
  MESSAGE_CENTRAL_KEY: process.env.MESSAGE_CENTRAL_KEY || "",
  MESSAGE_CENTRAL_PASSWORD: process.env.MESSAGE_CENTRAL_PASSWORD || "",
  MESSAGE_CENTRAL_EMAIL: process.env.MESSAGE_CENTRAL_EMAIL || "",
  MESSAGE_CENTRAL_COUNTRY: process.env.MESSAGE_CENTRAL_COUNTRY || "",

  // OTP
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10),
  OTP_MAX_ATTEMPTS: parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10),

  // App
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT || "15"),

  // Driver wallet
  DRIVER_MIN_WALLET_BALANCE: parseFloat(
    process.env.DRIVER_MIN_WALLET_BALANCE || "100",
  ),
  DRIVER_VERIFICATION_BONUS: parseFloat(
    process.env.DRIVER_VERIFICATION_BONUS || "3000",
  ),
  UNION_LEADER_REFERRAL_BONUS: parseFloat(
    process.env.UNION_LEADER_REFERRAL_BONUS || "300",
  ),

  // Ride matching radius in km
  DRIVER_SEARCH_RADIUS_KM: parseFloat(
    process.env.DRIVER_SEARCH_RADIUS_KM || "5",
  ),
  NEW_RIDER_WALLET_CREDIT: parseFloat(
    process.env.NEW_RIDER_WALLET_CREDIT || "3000",
  ),

  // Demo mode (use mock OTP instead of SMS delivery)
  DEMO_MODE:
    process.env.DEMO_MODE === "true" || process.env.NODE_ENV === "development",
  DEMO_OTP: process.env.DEMO_OTP || "123456",

  // Admin account creation
  ADMIN_CREATION_KEY: process.env.ADMIN_CREATION_KEY || "",

  // Firebase Cloud Messaging fallback for offline app users.
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  FIREBASE_USE_ADC: process.env.FIREBASE_USE_ADC !== "false",
  FIREBASE_SERVICE_ACCOUNT_JSON:
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",

  // Development helpers
  DEV_SEED_ACTIVE_DRIVERS:
    process.env.DEV_SEED_ACTIVE_DRIVERS === "true" ||
    (process.env.DEV_SEED_ACTIVE_DRIVERS !== "false" &&
      process.env.NODE_ENV !== "production"),

  // Google OAuth (used for social sign-in; required in production)
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
};
