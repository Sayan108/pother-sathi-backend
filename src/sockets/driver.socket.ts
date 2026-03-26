import { Server as SocketServer } from 'socket.io';
import { Driver } from '../models/Driver';
import { Ride } from '../models/Ride';
import { AuthenticatedSocket } from './socket.middleware';
import { riderSocketMap } from '../controllers/ride.controller';
import { logger } from '../utils/logger';

// In-memory map: driverId → socketId
// For production, use Redis
export const driverSocketMap = new Map<string, string>();

export function registerDriverSocketHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  const driverId = socket.userId;

  // Join driver-specific room
  socket.join(`driver:${driverId}`);

  // Register socket ID in maps and DB
  driverSocketMap.set(driverId, socket.id);
  Driver.findByIdAndUpdate(driverId, { socketId: socket.id }).exec();

  logger.debug(`Driver ${driverId} connected [socket: ${socket.id}]`);

  /**
   * driver:location_update
   * Driver sends their GPS coordinates periodically.
   * Payload: { lat: number; lng: number; rideId?: string }
   */
  socket.on('driver:location_update', async (data: { lat: number; lng: number; rideId?: string }) => {
    const { lat, lng, rideId } = data;

    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    // Update DB location
    await Driver.findByIdAndUpdate(driverId, {
      'location.coordinates': [lng, lat],
    });

    // If in active ride, forward location to rider
    if (rideId) {
      const ride = await Ride.findOne({
        _id: rideId,
        driverId,
        status: { $in: ['driver_assigned', 'driver_arrived', 'in_progress'] },
      }).select('riderId').lean();

      if (ride) {
        const riderSocketId = riderSocketMap.get(ride.riderId.toString());
        if (riderSocketId) {
          io.to(riderSocketId).emit('driver:location', {
            lat,
            lng,
            rideId,
          });
        }

        // Record path point during in_progress
        await Ride.findByIdAndUpdate(rideId, {
          $push: {
            driverPath: { lat, lng, timestamp: new Date() },
          },
        });
      }
    }
  });

  /**
   * driver:reject_ride
   * Driver explicitly rejects a ride request.
   * Payload: { rideId: string }
   */
  socket.on('driver:reject_ride', (data: { rideId: string }) => {
    logger.debug(`Driver ${driverId} rejected ride ${data.rideId}`);
    // No action needed on server unless tracking rejections
  });

  /**
   * Handle disconnection.
   */
  socket.on('disconnect', async (reason) => {
    logger.debug(`Driver ${driverId} disconnected: ${reason}`);
    driverSocketMap.delete(driverId);

    // Mark driver offline when disconnected
    await Driver.findByIdAndUpdate(driverId, {
      $set: { isOnline: false, isAvailable: false, socketId: null },
    });
  });
}
