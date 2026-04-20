import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { env } from "./environment";
import { logger } from "../utils/logger";

let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  const corsConfig =
    env.NODE_ENV === "development"
      ? {
          origin: true,
          methods: ["GET", "POST"],
          credentials: true,
        }
      : {
          origin: env.FRONTEND_URL,
          methods: ["GET", "POST"],
          credentials: true,
        };

  io = new SocketServer(httpServer, {
    cors: corsConfig,
    transports: ["websocket", "polling"],
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  logger.info("✅ Socket.io server initialized");
  if (env.NODE_ENV === "development") {
    logger.info("⚙️ Socket.io CORS set to allow all origins in development");
  }

  return io;
}

export function getIO(): SocketServer {
  if (!io)
    throw new Error(
      "Socket.io server not initialized. Call initSocketServer first.",
    );
  return io;
}
