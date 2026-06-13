import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

module.exports = async () => {
  const dockerUri = "mongodb://localhost:27017/pothersathi_test";
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret-for-testing-only-32chars";
  process.env.JWT_REFRESH_SECRET =
    "test-refresh-secret-for-testing-only-32chars";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.JWT_REFRESH_EXPIRES_IN = "7d";
  process.env.DEMO_MODE = "true";
  process.env.DEMO_OTP = "123456";
  process.env.ADMIN_CREATION_KEY = "";
  process.env.PORT = "0";
  process.env.PLATFORM_FEE_PERCENT = "15";

  let mongoUri = dockerUri;
  let mongod: MongoMemoryServer | null = null;

  try {
    await mongoose.connect(dockerUri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    await mongoose.disconnect();
  } catch {
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
  }

  process.env.MONGODB_URI = mongoUri;
  (global as any).__MONGOD__ = mongod;
};
