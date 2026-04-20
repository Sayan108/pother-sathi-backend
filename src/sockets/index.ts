import { Server as SocketServer, Socket } from "socket.io";
import { socketAuthMiddleware, AuthenticatedSocket } from "./socket.middleware";
import { registerRiderSocketHandlers } from "./rider.socket";
import { registerDriverSocketHandlers } from "./driver.socket";
import { logger } from "../utils/logger";

/**
 * Initializes all Socket.io namespaces and event handlers.
 * Must be called after initSocketServer().
 */
export function initSocketHandlers(io: SocketServer): void {
  // Apply JWT authentication middleware to all connections
  io.use(socketAuthMiddleware);

  io.on("connection", async (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    logger.info(
      `Socket connected: role=${authSocket.role} user=${authSocket.userId}`,
    );

    if (authSocket.role === "rider") {
      registerRiderSocketHandlers(io, authSocket);
    } else if (authSocket.role === "driver") {
      await registerDriverSocketHandlers(io, authSocket);
    } else {
      logger.warn(`Unknown role on socket connect: ${authSocket.role}`);
      socket.disconnect(true);
    }

    // Global error handler on each socket
    socket.on("error", (err: Error) => {
      logger.error(`Socket error [${authSocket.userId}]:`, err.message);
    });
  });

  logger.info("✅ Socket.io handlers registered");
}
