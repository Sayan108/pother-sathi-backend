# Socket.IO Events — Pother Sathi Backend

This document describes the full Socket.IO event contract between clients and the backend.

## Authentication

Clients must send a valid JWT access token when connecting.

```javascript
const socket = io("http://localhost:5000", {
  auth: { token: "YOUR_JWT_ACCESS_TOKEN" },
});
```

If the token is missing or invalid, the server rejects the connection.

## Rider Events (Client → Server)

### `ride:search`

- Payload: `{ pickup, drop, vehicleType, couponCode? }`
- Returns: callback `{ success, fareBreakdown, availableDrivers, error? }`
- Description: Estimates fare and returns available drivers.

### `ride:book`

- Payload: `{ pickup, drop, vehicleType, couponCode?, paymentMethod? }`
- Returns: callback `{ success, rideId, otp, fareBreakdown, status, driver, error? }`
- Description: Books a ride and assigns a driver if available.

### `ride:cancel`

- Payload: `{ rideId, reason? }`
- Returns: callback `{ success, error? }`
- Description: Cancels an active ride from the rider side.

### `rider:cancel_search`

- Payload: `{ rideId }`
- Emits: `ride:cancelled` to the rider when a searching ride is canceled.
- Description: Cancels a ride that is still in `searching` state.

### `rider:ping`

- Payload: none
- Emits: `rider:pong` to the rider with `{ timestamp }`
- Description: Heartbeat event to confirm socket liveness.

## Driver Events (Client → Server)

### `ride:accept`

- Payload: `{ rideId }`
- Returns: callback `{ success, rideId, error? }`
- Description: Driver accepts a searching ride request.

### `ride:arrived`

- Payload: `{ rideId }`
- Returns: callback `{ success, error? }`
- Description: Driver marks arrival at the pickup location.

### `ride:verify_otp`

- Payload: `{ rideId, otp }`
- Returns: callback `{ success, rideId, error? }`
- Description: Driver verifies rider OTP and starts the ride.

### `ride:complete`

- Payload: `{ rideId }`
- Returns: callback `{ success, rideId, earning, platformFee, walletBalance, error? }`
- Description: Completes the ride and settles driver earnings.

### `ride:cancel`

- Payload: `{ rideId, reason? }`
- Returns: callback `{ success, error? }`
- Description: Cancels an assigned ride from the driver side.

### `driver:location_update`

- Payload: `{ lat, lng, rideId? }`
- Description: Updates driver location. If `rideId` belongs to an active ride, the rider receives `driver:location` updates.

### `driver:reject_ride`

- Payload: `{ rideId }`
- Description: Logs a ride rejection. This event does not return a callback.

## Server Events (Server → Client)

### Rider-facing events

- `ride:driver_assigned`
  - Payload: `{ rideId, driver, estimatedArrival }`
  - Description: Sent to the rider when a driver accepts the ride.

- `ride:driver_arrived`
  - Payload: `{ rideId }`
  - Description: Driver has arrived at pickup.

- `ride:started`
  - Payload: `{ rideId }`
  - Description: Ride has started after OTP verification.

- `ride:completed`
  - Payload: `{ rideId, fare, paymentMethod }`
  - Description: Ride completed successfully.

- `ride:cancelled`
  - Payload: `{ rideId, cancelledBy, reason? }`
  - Description: Rider or driver canceled the ride.

- `ride:driver_cancelled`
  - Payload: `{ rideId, cancelledBy, reason? }`
  - Description: Driver canceled the ride and rider is notified.

- `driver:location`
  - Payload: `{ lat, lng, rideId }`
  - Description: Live driver location updates forwarded to the rider.

- `rider:pong`
  - Payload: `{ timestamp }`
  - Description: Heartbeat reply from server to rider.

### Driver-facing events

- `ride:assigned`
  - Payload: `{ rideId, pickup, drop, riderId }`
  - Description: Sent to a driver when a rider books a ride and the driver is currently online.

## Socket Testing

Run the socket event tests with:

```bash
npm test -- tests/sockets/socket.test.ts
```

For coverage and a generated report:

```bash
npm run test:coverage -- tests/sockets/socket.test.ts
```
