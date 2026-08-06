import { Socket } from "socket.io";

export type NotificationRole = "rider" | "driver" | "admin";

export const ADMIN_NOTIFICATION_EVENT = "admin:notification";
export const GLOBAL_NOTIFICATION_ROOM = "notifications";

export function roleNotificationRoom(role: NotificationRole): string {
  return `notifications:${role}s`;
}

export function userNotificationRoom(
  role: NotificationRole,
  userId: string,
): string {
  return `notifications:${role}:${userId}`;
}

export function joinNotificationRooms(
  socket: Socket,
  role: NotificationRole,
  userId: string,
): void {
  socket.data.userId = userId;
  socket.data.role = role;
  socket.join(GLOBAL_NOTIFICATION_ROOM);
  socket.join(roleNotificationRoom(role));
  socket.join(userNotificationRoom(role, userId));
}
