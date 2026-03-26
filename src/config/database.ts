import mongoose from "mongoose";
import { logger } from "../utils/logger";
import { env } from "./environment";

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) return;

  mongoose.set("strictQuery", true);

  try {
    if (!env.MONGODB_URI) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    await mongoose.connect(env.MONGODB_URI, {
      autoIndex: true,
    });
    isConnected = true;
    logger.info("✅ MongoDB connected successfully");

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info("MongoDB disconnected");
}
