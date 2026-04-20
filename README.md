# Pather Sathi — Backend

Full-featured **Node.js + TypeScript** backend for the Pather Sathi ride-sharing app.

## Tech Stack

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Runtime   | Node.js 18+                      |
| Framework | Express.js                       |
| Language  | TypeScript                       |
| Database  | MongoDB + Mongoose               |
| Real-time | Socket.io                        |
| Auth      | JWT (access + refresh tokens)    |
| OTP       | Twilio SMS / Demo mode           |
| Security  | Helmet, CORS, rate-limit, bcrypt |
| Logging   | Winston                          |

---

## Project Structure

```
backend/
└── src/
    ├── config/
    │   ├── database.ts       MongoDB connection
    │   ├── environment.ts    Env variable validation
    │   └── socket.ts         Socket.io server factory
    ├── models/
    │   ├── User.ts           Rider model
    │   ├── Driver.ts         Driver model (GeoJSON location)
    │   ├── Ride.ts           Ride lifecycle model
    │   ├── OTP.ts            OTP with TTL index
    │   └── Transaction.ts    Wallet transaction ledger
    ├── controllers/
    │   ├── auth.controller.ts      Send/verify OTP, JWT tokens
    │   ├── rider.controller.ts     Profile, ride history
    │   ├── driver.controller.ts    Register, wallet, online status
    │   └── ride.controller.ts      Book, accept, complete, rate
    ├── routes/
    │   ├── auth.routes.ts
    │   ├── rider.routes.ts
    │   ├── driver.routes.ts
    │   └── ride.routes.ts
    ├── middleware/
    │   ├── auth.middleware.ts      JWT verify, role guards
    │   ├── validation.middleware.ts
    │   └── error.middleware.ts     Global error handler
    ├── services/
    │   ├── otp.service.ts          OTP generate/send/verify
    │   └── fare.service.ts         Fare calc + Haversine distance
    ├── sockets/
    │   ├── index.ts                Socket.io bootstrap
    │   ├── socket.middleware.ts    JWT auth for WS
    │   ├── rider.socket.ts         Rider events
    │   └── driver.socket.ts        Driver location + events
    └── utils/
        ├── jwt.ts
        ├── response.ts
        └── logger.ts
```

---

## Quick Start

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secrets
```

### 3. Start MongoDB

```bash
# Local MongoDB
mongod --dbpath ./data
# Or use MongoDB Atlas URI in .env
```

### 4. Run in development

```bash
npm run dev
```

The server starts on `http://localhost:5000`.

---

## API Reference

### Auth

| Method | Endpoint               | Description             |
| ------ | ---------------------- | ----------------------- |
| POST   | `/api/auth/send-otp`   | Send OTP to phone       |
| POST   | `/api/auth/verify-otp` | Verify OTP → JWT tokens |
| POST   | `/api/auth/refresh`    | Refresh access token    |
| POST   | `/api/auth/logout`     | Logout (client-side)    |

### Rider

| Method | Endpoint                   | Description                    |
| ------ | -------------------------- | ------------------------------ |
| GET    | `/api/rider/profile`       | Get rider profile              |
| PUT    | `/api/rider/profile`       | Update profile                 |
| GET    | `/api/rider/rides`         | Ride history (paginated)       |
| GET    | `/api/rider/rides/:rideId` | Single ride details            |
| PUT    | `/api/rider/fcm-token`     | Update push notification token |

### Driver

| Method | Endpoint                      | Description                      |
| ------ | ----------------------------- | -------------------------------- |
| POST   | `/api/driver/register`        | Complete multi-step registration |
| GET    | `/api/driver/profile`         | Get driver profile               |
| PUT    | `/api/driver/profile`         | Update profile                   |
| PATCH  | `/api/driver/online-status`   | Toggle online/offline            |
| PATCH  | `/api/driver/location`        | Update GPS location              |
| GET    | `/api/driver/rides`           | Ride history                     |
| GET    | `/api/driver/wallet`          | Wallet balance + transactions    |
| POST   | `/api/driver/wallet/recharge` | Recharge wallet                  |

### Rides

| Method | Endpoint                        | Auth         | Description         |
| ------ | ------------------------------- | ------------ | ------------------- |
| GET    | `/api/rides/fare-estimate`      | Any          | Estimate fare       |
| POST   | `/api/rides/book`               | Rider        | Book a ride         |
| GET    | `/api/rides/active`             | Any          | Current active ride |
| GET    | `/api/rides/:rideId`            | Rider/Driver | Ride details        |
| POST   | `/api/rides/:rideId/accept`     | Driver       | Accept ride request |
| POST   | `/api/rides/:rideId/arrived`    | Driver       | Mark driver arrived |
| POST   | `/api/rides/:rideId/verify-otp` | Driver       | Verify rider OTP    |
| POST   | `/api/rides/:rideId/complete`   | Driver       | Complete ride       |
| POST   | `/api/rides/:rideId/cancel`     | Rider/Driver | Cancel ride         |
| POST   | `/api/rides/:rideId/rate`       | Rider/Driver | Rate the ride       |

---

## Socket.io Events

Detailed Socket.IO event documentation is available in [`SOCKET_EVENTS.md`](./SOCKET_EVENTS.md).

### Client → Server

| Event                    | Payload                                                      | Description                              |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| `ride:search`            | `{ pickup, drop, vehicleType, couponCode? }`                 | Estimate fare and list available drivers |
| `ride:book`              | `{ pickup, drop, vehicleType, couponCode?, paymentMethod? }` | Book a ride and assign a driver          |
| `ride:cancel`            | `{ rideId, reason? }`                                        | Cancel an active ride                    |
| `rider:cancel_search`    | `{ rideId }`                                                 | Cancel a ride that is still searching    |
| `rider:ping`             | —                                                            | Heartbeat check                          |
| `ride:accept`            | `{ rideId }`                                                 | Driver accepts a searching ride          |
| `ride:arrived`           | `{ rideId }`                                                 | Driver arrives at pickup                 |
| `ride:verify_otp`        | `{ rideId, otp }`                                            | Driver verifies the ride OTP             |
| `ride:complete`          | `{ rideId }`                                                 | Driver completes the ride                |
| `ride:cancel`            | `{ rideId, reason? }`                                        | Driver cancels an assigned ride          |
| `driver:location_update` | `{ lat, lng, rideId? }`                                      | Driver location updates                  |
| `driver:reject_ride`     | `{ rideId }`                                                 | Driver rejects a ride request            |

### Server → Client

| Event                   | Payload                                | Description                          |
| ----------------------- | -------------------------------------- | ------------------------------------ |
| `ride:assigned`         | `{ rideId, pickup, drop, riderId }`    | Ride assigned to driver              |
| `ride:driver_assigned`  | `{ rideId, driver, estimatedArrival }` | Driver assigned to rider             |
| `ride:driver_arrived`   | `{ rideId }`                           | Driver has arrived                   |
| `ride:started`          | `{ rideId }`                           | Ride started after OTP verification  |
| `ride:completed`        | `{ rideId, fare, paymentMethod }`      | Ride completed successfully          |
| `ride:cancelled`        | `{ rideId, cancelledBy, reason? }`     | Ride canceled                        |
| `ride:driver_cancelled` | `{ rideId, cancelledBy, reason? }`     | Driver canceled ride                 |
| `driver:location`       | `{ lat, lng, rideId }`                 | Live driver location update to rider |
| `rider:pong`            | `{ timestamp }`                        | Heartbeat response                   |

### Authentication

Connections require a valid JWT access token in `auth.token`:

```javascript
const socket = io("http://localhost:5000", {
  auth: { token: "YOUR_JWT_ACCESS_TOKEN" },
});
```

For full Socket.IO event documentation and test coverage results, see `SOCKET_EVENTS.md` and `SOCKET_TEST_REPORT.md`.

---

## Authentication Flow

```
1. POST /api/auth/send-otp  →  { phone, role }
2. POST /api/auth/verify-otp  →  { phone, otp, role }
   ← { accessToken, refreshToken, user }
3. All subsequent requests: Authorization: Bearer <accessToken>
4. POST /api/auth/refresh  →  { refreshToken }
   ← { accessToken }
```

**Demo Mode** (development): Set `DEMO_MODE=true` in `.env`.  
The OTP will be returned in the API response (default `123456`).

---

## Driver Registration Flow

```
1. Driver verifies phone → receives JWT
2. POST /api/driver/register  (name, vehicle info, documents)
   ← accountStatus: 'pending'
3. Admin verifies driver (accountStatus → 'verified')
4. Driver can now go online
```

---

## Ride Flow

```
Rider:
  POST /api/rides/book  → ride created, nearby drivers notified via socket

Driver receives:  ride:new_request
  POST /api/rides/:id/accept  → rider notified via ride:driver_assigned

Driver:   POST /api/rides/:id/arrived  → rider: ride:driver_arrived
Driver:   POST /api/rides/:id/verify-otp (rider's OTP)  → ride:started
Driver:   POST /api/rides/:id/complete  → ride:completed, wallet credited

Both:     POST /api/rides/:id/rate
```

---

## Security Measures

- **JWT** with short-lived access tokens (7d) and refresh tokens (30d)
- **OTP rate limiting** — max 5 requests per 15 minutes per IP
- **Global rate limiting** — 200 req/15 min per IP
- **Helmet** for HTTP security headers
- **Input validation** via `express-validator` on all endpoints
- **GeoJSON 2dsphere** index for secure driver proximity queries
- **TTL index** on OTP collection — expired OTPs auto-deleted
- No raw passwords stored — phone-only auth via OTP
