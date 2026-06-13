# Frontend Integration Notes - Recent Backend Changes

Last updated: 2026-05-02

This document summarizes the latest backend behavior that the rider, driver,
and admin frontend applications should follow.

## Summary

- The backend now fails fast when required server environment variables are
  missing. Backend deployments must define `MONGODB_URI`, `JWT_SECRET`, and
  `JWT_REFRESH_SECRET`.
- Driver login is now Google-based through `POST /api/auth/driver/google-login`.
  A new driver receives a stub account and must complete KYC with
  `POST /api/driver/register`.
- Rider social login is available through `POST /api/auth/social-login`.
- Ride lifecycle actions are handled through Socket.io instead of REST.
  REST ride routes are now mainly for fare estimates, active ride lookup,
  ride details, and ratings.
- Drivers must be verified and have enough wallet balance before going online.
- Driver wallet recharge can be submitted directly or as an admin approval
  request.

## Base URLs

Use the backend HTTP URL for REST calls:

```ts
const API_BASE_URL = "http://localhost:5000";
```

Use the same host for Socket.io:

```ts
const SOCKET_URL = "http://localhost:5000";
```

## Response Shape

Most REST responses use this shape:

```ts
type ApiResponse<T> = {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: unknown;
  };
};
```

For failed requests, show `message` to the user when possible. Validation errors
may also include an `errors` array.

## Authentication

Store both tokens after login:

- `accessToken`: send as `Authorization: Bearer <token>` for REST calls and as
  Socket.io auth.
- `refreshToken`: use with `POST /api/auth/refresh` when the access token
  expires.

### Phone OTP Login

Riders can still use OTP login. Driver OTP login may create an incomplete driver
stub, but the driver app should prefer Google login.

Send OTP:

```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "phone": "9876543210",
  "countryCode": "+91",
  "role": "rider"
}
```

Verify OTP:

```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone": "9876543210",
  "countryCode": "+91",
  "otp": "123456",
  "role": "rider"
}
```

Successful response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "role": "rider",
    "isNewUser": false,
    "walletBalance": 0,
    "user": {
      "id": "...",
      "phone": "9876543210",
      "name": "User name",
      "email": "user@example.com",
      "avatar": "https://...",
      "rating": 5,
      "walletBalance": 0,
      "profileStatus": "complete"
    }
  }
}
```

In development/demo mode, `send-otp` can return the OTP in `data.otp`.

### Rider Social Login

Use this after the mobile/web frontend receives an identity token from Google or
Facebook.

```http
POST /api/auth/social-login
Content-Type: application/json

{
  "provider": "google",
  "idToken": "<provider-id-token>",
  "deviceId": "<stable-device-id>"
}
```

Supported providers:

- `google`
- `facebook`

The backend may reuse an existing rider account for the same device ID or email.
For a new social rider, phone is a generated placeholder until the app adds a
phone-linking flow.

### Driver Google Login

The driver app should use this as the main driver login entry point.

```http
POST /api/auth/driver/google-login
Content-Type: application/json

{
  "idToken": "<google-id-token>",
  "deviceId": "<stable-device-id>"
}
```

Successful response:

```json
{
  "success": true,
  "message": "Google login successful. Please complete your KYC to start driving.",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "role": "driver",
    "isNewDriver": true,
    "driver": {
      "id": "...",
      "name": "Driver name",
      "email": "driver@example.com",
      "avatar": "https://...",
      "accountStatus": "incomplete",
      "walletBalance": 0,
      "kycRequired": true
    }
  }
}
```

Frontend behavior:

- If `driver.kycRequired` is true or `accountStatus` is `incomplete`, send the
  driver to KYC registration.
- If `accountStatus` is `pending`, show the admin-review state.
- If `accountStatus` is `verified`, allow the driver dashboard and online
  controls.
- If the backend returns `403`, show the backend `message`; this can happen for
  device reuse, inactive accounts, or suspended drivers.

### Token Refresh

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh-token>"
}
```

Response:

```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "..."
  }
}
```

### Logout

```http
POST /api/auth/logout
Authorization: Bearer <access-token>
```

The backend is stateless for logout. The frontend must delete local tokens.

## Driver Onboarding and KYC

After driver Google login, complete the driver profile:

```http
POST /api/driver/register
Authorization: Bearer <driver-access-token>
Content-Type: application/json

{
  "name": "Driver Name",
  "vehicleType": "bike",
  "vehicleModel": "Honda Shine",
  "vehicleNumber": "WB12AB1234",
  "vehicleColor": "Black",
  "vehicleYear": "2022",
  "licenseNumber": "WB0120230001234",
  "aadhaarNumber": "123456789012",
  "selfieDocument": "https://cdn.example.com/selfie.jpg",
  "aadhaarDocument": "https://cdn.example.com/aadhaar.jpg",
  "licenseDocument": "https://cdn.example.com/license.jpg",
  "vehicleDocument": "https://cdn.example.com/vehicle.jpg",
  "licenseExpiry": "2030-12-31",
  "serviceArea": "Kolkata",
  "email": "driver@example.com",
  "gender": "male",
  "avatar": "https://cdn.example.com/avatar.jpg",
  "referralCode": "ULABC123XYZ"
}
```

Important validation rules:

- `vehicleType` must be one of `bike`, `auto`, `toto`, `car`, `delivery`.
- `aadhaarNumber` must be exactly 12 digits.
- `selfieDocument` is required and must be a valid URL.
- Document fields must be URLs when provided.
- Aadhaar and driving licence are duplicate-checked. A duplicate returns `409`.

After registration, `accountStatus` becomes `pending`. The driver must wait for
approval/activation before going online.

Admin approval is available through the admin API. After approval, the backend
sets `accountStatus` to `verified`, sets `isVerified` to true, and credits the
driver verification bonus to the driver wallet.

## Driver Dashboard

All driver routes require:

```http
Authorization: Bearer <driver-access-token>
```

Useful routes:

```http
GET   /api/driver/profile
PUT   /api/driver/profile
PATCH /api/driver/online-status
PATCH /api/driver/location
GET   /api/driver/rides?page=1&limit=10
GET   /api/driver/wallet?page=1&limit=20
POST  /api/driver/wallet/recharge
POST  /api/driver/wallet/recharge-request
PUT   /api/driver/fcm-token
POST  /api/driver/referral-code
```

Go online/offline:

```http
PATCH /api/driver/online-status
Authorization: Bearer <driver-access-token>
Content-Type: application/json

{
  "isOnline": true
}
```

The backend rejects online status when:

- The driver is not verified.
- The driver wallet is below `DRIVER_MIN_WALLET_BALANCE`.

Update driver location:

```http
PATCH /api/driver/location
Authorization: Bearer <driver-access-token>
Content-Type: application/json

{
  "lat": 22.5726,
  "lng": 88.3639
}
```

## Admin Frontend

All admin routes require:

```http
Authorization: Bearer <admin-access-token>
```

Create the first/admin account:

```http
POST /api/auth/admin/register
Content-Type: application/json

{
  "phone": "9876543210",
  "countryCode": "+91",
  "password": "strong-password",
  "name": "Admin",
  "adminSecret": "<optional-admin-creation-key>"
}
```

Admin login:

```http
POST /api/auth/admin/login
Content-Type: application/json

{
  "phone": "9876543210",
  "countryCode": "+91",
  "password": "strong-password"
}
```

Driver approval routes:

```http
GET   /api/admin/drivers/pending?page=1&limit=20
PATCH /api/admin/drivers/:id/verify
PATCH /api/admin/drivers/:id/reject
PATCH /api/admin/drivers/:id/wallet
```

Wallet adjustment payload:

```json
{
  "action": "credit",
  "amount": 500,
  "description": "Manual wallet correction"
}
```

`action` must be one of `credit`, `debit`, or `set`.

Driver recharge approval routes:

```http
GET   /api/admin/driver/wallet/recharge-requests?status=pending&page=1&limit=20
PATCH /api/admin/driver/wallet/recharge-requests/:id/approve
PATCH /api/admin/driver/wallet/recharge-requests/:id/reject
```

## Rider Dashboard

All rider routes require:

```http
Authorization: Bearer <rider-access-token>
```

Useful routes:

```http
GET /api/rider/profile
PUT /api/rider/profile
GET /api/rider/rides?page=1&limit=10
GET /api/rider/rides/:rideId
GET /api/rider/wallet?page=1&limit=10
PUT /api/rider/fcm-token
```

Update FCM token:

```http
PUT /api/rider/fcm-token
Authorization: Bearer <rider-access-token>
Content-Type: application/json

{
  "fcmToken": "<firebase-token>"
}
```

## Ride REST Routes

Ride lifecycle actions are no longer REST-first. Use these REST routes for read
and support screens:

```http
GET  /api/rides/fare-estimate?pickupLat=22.57&pickupLng=88.36&dropLat=22.58&dropLng=88.37&vehicleType=bike&couponCode=SAVE10
GET  /api/rides/active
GET  /api/rides/:rideId
POST /api/rides/:rideId/rate
```

Rating request:

```http
POST /api/rides/:rideId/rate
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "rating": 5,
  "review": "Good ride"
}
```

## Socket.io Setup

Install Socket.io client in the frontend:

```bash
npm install socket.io-client
```

Connect with the logged-in access token:

```ts
import { io } from "socket.io-client";

const socket = io(SOCKET_URL, {
  auth: {
    token: accessToken,
  },
  transports: ["websocket"],
});

socket.on("connect_error", (error) => {
  console.error(error.message);
});
```

The token must belong to a `rider` or `driver`. Admin sockets are disconnected.

## Rider Socket Flow

### Search

```ts
socket.emit(
  "ride:search",
  {
    pickup: { lat: 22.5726, lng: 88.3639, address: "Pickup" },
    drop: { lat: 22.585, lng: 88.4, address: "Drop" },
    vehicleType: "bike",
    couponCode: "SAVE10",
  },
  (response) => {
    if (!response.success) return;
    console.log(response.fareBreakdown);
    console.log(response.availableDrivers);
  },
);
```

Response:

```ts
type RideSearchResponse = {
  success: boolean;
  error?: string;
  fareBreakdown?: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    subtotal: number;
    discount: number;
    platformFee: number;
    driverEarning: number;
    finalFare: number;
    estimatedDuration: number;
  };
  availableDrivers?: Array<{
    _id: string;
    name?: string;
    phone: string;
    vehicleType: string;
    vehicleModel?: string;
    vehicleNumber?: string;
    vehicleColor?: string;
    serviceArea?: string;
  }>;
};
```

### Book

```ts
socket.emit(
  "ride:book",
  {
    pickup: { lat: 22.5726, lng: 88.3639, address: "Pickup" },
    drop: { lat: 22.585, lng: 88.4, address: "Drop" },
    vehicleType: "bike",
    couponCode: "SAVE10",
    paymentMethod: "cash",
  },
  (response) => {
    if (!response.success) {
      console.error(response.error);
      return;
    }
    console.log(response.rideId, response.otp, response.driver);
  },
);
```

Supported payment methods:

- `cash`
- `wallet`
- `upi`

The rider app should show the returned `otp` to the rider. The driver uses this
OTP to start the ride.

### Cancel

```ts
socket.emit(
  "ride:cancel",
  {
    rideId,
    reason: "Changed plans",
  },
  (response) => {
    if (!response.success) console.error(response.error);
  },
);
```

### Rider Listeners

```ts
socket.on("ride:driver_assigned", (data) => {});
socket.on("ride:driver_arrived", (data) => {});
socket.on("ride:started", (data) => {});
socket.on("ride:completed", (data) => {});
socket.on("ride:cancelled", (data) => {});
socket.on("ride:driver_cancelled", (data) => {});
socket.on("driver:location", (data) => {});
```

`driver:location` payload:

```ts
{
  lat: number;
  lng: number;
  rideId: string;
}
```

## Driver Socket Flow

### Incoming Assignment

```ts
socket.on("ride:assigned", (data) => {
  console.log(data.rideId, data.pickup, data.drop, data.fare);
});
```

Payload includes:

```ts
{
  rideId: string;
  pickup: { lat: number; lng: number; address?: string };
  drop: { lat: number; lng: number; address?: string };
  fare: number;
  platformFee: number;
  income: number;
  driverEarning: number;
  paymentMethod: "cash" | "wallet" | "upi";
  riderId: string;
}
```

### Accept Ride

```ts
socket.emit("ride:accept", { rideId }, (response) => {
  if (!response.success) console.error(response.error);
});
```

### Mark Arrival

```ts
socket.emit("ride:arrived", { rideId }, (response) => {
  if (!response.success) console.error(response.error);
});
```

### Verify OTP and Start Ride

```ts
socket.emit("ride:verify_otp", { rideId, otp }, (response) => {
  if (!response.success) console.error(response.error);
});
```

### Send Live Location

Send location periodically while online, especially during an active ride:

```ts
socket.emit("driver:location_update", {
  lat: 22.5726,
  lng: 88.3639,
  rideId,
});
```

When `rideId` is provided and the ride is active, the backend forwards the
location to the rider as `driver:location`.

### Complete Ride

```ts
socket.emit("ride:complete", { rideId }, (response) => {
  if (!response.success) {
    console.error(response.error);
    return;
  }
  console.log(response.earning, response.platformFee, response.walletBalance);
});
```

Wallet payment behavior:

- If `paymentMethod` is `wallet`, the backend checks rider wallet balance at
  completion time.
- If the rider wallet is insufficient, completion fails and the frontend should
  ask the rider to use another payment method or recharge.

### Cancel Ride

```ts
socket.emit(
  "ride:cancel",
  {
    rideId,
    reason: "Vehicle issue",
  },
  (response) => {
    if (!response.success) console.error(response.error);
  },
);
```

## Ride Status Values

Frontend state machines should support these statuses:

```ts
type RideStatus =
  | "searching"
  | "driver_assigned"
  | "driver_arrived"
  | "otp_verified"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_driver";
```

Current socket flow uses `in_progress` after OTP verification.

## Frontend Implementation Checklist

- Add separate login flows for rider OTP/social login and driver Google login.
- Store `accessToken`, `refreshToken`, `role`, and profile data after login.
- Redirect drivers by `accountStatus`: `incomplete` to KYC, `pending` to review,
  `verified` to dashboard.
- Use Socket.io for ride search, booking, driver acceptance, arrival, OTP start,
  completion, cancellation, and live driver location.
- Keep REST calls for profile, wallet, ride history, active ride recovery, fare
  estimate, FCM token, and ratings.
- On app restart, call `GET /api/rides/active` after reconnecting to restore the
  current ride screen.
- For driver apps, call `PATCH /api/driver/online-status` before expecting ride
  assignments.
- Send driver live location through `driver:location_update`.
- Always display backend `message` or socket `error` for blocked states such as
  duplicate KYC, suspended account, low wallet balance, or invalid OTP.
