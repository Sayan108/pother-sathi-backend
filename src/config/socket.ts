import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { logger } from "../utils/logger";
import { socketCorsOptions } from "./cors";

let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: socketCorsOptions,
    transports: ["websocket", "polling"],
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  logger.info("Socket.io server initialized");

  return io;
}

export function getIO(): SocketServer {
  if (!io) {
    throw new Error(
      "Socket.io server not initialized. Call initSocketServer first.",
    );
  }

  return io;
}
