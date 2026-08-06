import { Server as SocketServer } from "socket.io";
import { AuthenticatedSocket } from "./socket.middleware";
import { joinNotificationRooms } from "./notification.rooms";
import { logger } from "../utils/logger";

export function registerAdminSocketHandlers(
  _io: SocketServer,
  socket: AuthenticatedSocket,
): void {
  const adminId = socket.userId;

  socket.join(`admin:${adminId}`);
  socket.join("admins");
  joinNotificationRooms(socket, "admin", adminId);

  logger.debug(`Admin ${adminId} connected [socket: ${socket.id}]`);

  socket.on("disconnect", (reason) => {
    logger.debug(`Admin ${adminId} disconnected: ${reason}`);
  });
}
