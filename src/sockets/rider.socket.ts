import { Server as SocketServer } from 'socket.io';
import { Ride } from '../models/Ride';
import { User } from '../models/User';
import { AuthenticatedSocket } from './socket.middleware';
import { riderSocketMap } from '../controllers/ride.controller';
import { logger } from '../utils/logger';

export function registerRiderSocketHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  const riderId = socket.userId;

  // Join rider-specific room
  socket.join(`rider:${riderId}`);

  // Register in-memory socket map (used by ride controller to push events)
  riderSocketMap.set(riderId, socket.id);

  logger.debug(`Rider ${riderId} connected [socket: ${socket.id}]`);

  /**
   * rider:cancel_search
   * Rider cancels a ride that hasn't been assigned yet.
   * Payload: { rideId: string }
   */
  socket.on('rider:cancel_search', async (data: { rideId: string }) => {
    try {
      const ride = await Ride.findOne({
        _id: data.rideId,
        riderId,
        status: 'searching',
      });

      if (!ride) return;

      ride.status = 'cancelled';
      ride.cancelledBy = 'rider';
      ride.cancelledAt = new Date();
      await ride.save();

      socket.emit('ride:cancelled', { rideId: data.rideId, cancelledBy: 'rider' });
      logger.debug(`Rider ${riderId} cancelled searching ride ${data.rideId}`);
    } catch (err) {
      logger.error('rider:cancel_search error:', err);
    }
  });

  /**
   * rider:ping
   * Heartbeat to keep socket alive and check active ride status.
   */
  socket.on('rider:ping', () => {
    socket.emit('rider:pong', { timestamp: Date.now() });
  });

  /**
   * Handle disconnection.
   */
  socket.on('disconnect', (reason) => {
    logger.debug(`Rider ${riderId} disconnected: ${reason}`);
    riderSocketMap.delete(riderId);
  });
}
