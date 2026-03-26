import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { Driver } from '../models/Driver';
import { User } from '../models/User';
import { logger } from '../utils/logger';

/**
 * Authenticated socket payload after JWT verification.
 */
export interface AuthenticatedSocket extends Socket {
  userId: string;
  role: 'rider' | 'driver';
  phone: string;
}

/**
 * Socket.io authentication middleware.
 * Expects JWT token in socket.handshake.auth.token or query.token.
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  const token =
    (socket.handshake.auth.token as string) ||
    (socket.handshake.query.token as string);

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const payload = verifyAccessToken(token);
    const authSocket = socket as AuthenticatedSocket;
    authSocket.userId = payload.id;
    authSocket.role = payload.role;
    authSocket.phone = payload.phone;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
