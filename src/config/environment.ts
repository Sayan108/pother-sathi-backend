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
  MONGODB_URI: process.env.MONGODB_URI,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || required("JWT_REFRESH_SECRET"),
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  // Twilio (OTP)
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || "",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || "",
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || "",

  // OTP
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10),
  OTP_MAX_ATTEMPTS: parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10),

  // App
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT || "15"),

  // Driver wallet
  DRIVER_MIN_WALLET_BALANCE: parseFloat(
    process.env.DRIVER_MIN_WALLET_BALANCE || "100",
  ),
  DRIVER_REFERRAL_BONUS: parseFloat(
    process.env.DRIVER_REFERRAL_BONUS || "1000",
  ),

  // Ride matching radius in km
  DRIVER_SEARCH_RADIUS_KM: parseFloat(
    process.env.DRIVER_SEARCH_RADIUS_KM || "5",
  ),
  NEW_RIDER_WALLET_CREDIT: parseFloat(
    process.env.NEW_RIDER_WALLET_CREDIT || "3000",
  ),

  // Demo mode (use mock OTP instead of Twilio)
  DEMO_MODE:
    process.env.DEMO_MODE === "true" || process.env.NODE_ENV === "development",
  DEMO_OTP: process.env.DEMO_OTP || "123456",

  // Development helpers
  DEV_SEED_ACTIVE_DRIVERS:
    process.env.DEV_SEED_ACTIVE_DRIVERS === "true" ||
    (process.env.DEV_SEED_ACTIVE_DRIVERS !== "false" &&
      process.env.NODE_ENV !== "production"),
};
