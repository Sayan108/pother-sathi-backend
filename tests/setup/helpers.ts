import mongoose from "mongoose";
import http from "http";
import { createApp } from "../../src/app";
import { initSocketServer } from "../../src/config/socket";
import { initSocketHandlers } from "../../src/sockets";
import { signAccessToken, signRefreshToken } from "../../src/utils/jwt";

export async function connectTestDB(): Promise<void> {
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
}

export async function disconnectTestDB(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export async function clearCollections(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

export function createTestServer(): {
  httpServer: http.Server;
  app: ReturnType<typeof createApp>;
} {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);
  initSocketHandlers(io);
  return { httpServer, app };
}

export function generateRiderToken(
  userId: string = new mongoose.Types.ObjectId().toString(),
  phone: string = "9876543210",
): string {
  return signAccessToken({ id: userId, phone, role: "rider" });
}

export function generateDriverToken(
  userId: string = new mongoose.Types.ObjectId().toString(),
  phone: string = "9876543211",
): string {
  return signAccessToken({ id: userId, phone, role: "driver" });
}

export function generateAdminToken(
  userId: string = new mongoose.Types.ObjectId().toString(),
  phone: string = "9876543219",
): string {
  return signAccessToken({ id: userId, phone, role: "admin" });
}

export function generateRefreshToken(
  userId: string,
  phone: string,
  role: "rider" | "driver" | "admin",
): string {
  return signRefreshToken({ id: userId, phone, role });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
