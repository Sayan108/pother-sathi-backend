# Pother Sathi Backend — Runtime Testing & Audit Report

> **Generated:** 2026-04-10  
> **Tech Stack:** Node.js 24, Express 4, MongoDB 7, Socket.IO 4  
> **Environment:** Sandboxed Dev Server (MongoDB via Docker)  
> **Test Framework:** Jest 30, Supertest 7, socket.io-client 4  
> **Total Tests:** 112 | **Passed:** 112 | **Failed:** 0

---

## 1. Executive Summary

The Pather Sathi backend API was fully tested at runtime using **112 automated tests** covering all REST API endpoints, Socket.IO events, unit-level business logic, and edge cases. Three bugs were discovered and fixed during testing, and one security concern was identified for remediation.

**Overall findings:**
- ✅ All 112 tests pass after bug fixes
- 🐛 **3 bugs fixed** (1 would cause crashes in production)
- ⚠️ **4 security issues** identified (rate limiting, token blocklist, OTP limiter, JWT secret)
- ⚡ **API response times**: 9ms–154ms (all under 500ms threshold)
- 🔌 **Socket latency**: 138ms–742ms (location updates are slowest)

---

## 2. API Execution Report

### Health Check

| Endpoint | Method | Payload | Status | Response | Time (ms) | Result |
|----------|--------|---------|--------|----------|-----------|--------|
| `/health` | GET | — | 200 | `{success:true, message:"Pather Sathi API is running"}` | 51 | ✅ PASS |
| `/api/health` | GET | — | 200 | `{success:true, ...}` | 66 | ✅ PASS |
| `/api/nonexistent` | GET | — | 404 | `{success:false, message:"Not found"}` | 26 | ✅ PASS |
| `/api/auth/send-otp` | POST | 1.5MB payload | 413 | Payload Too Large | 24 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{ invalid json }` | 400 | SyntaxError | 9 | ✅ PASS |

### Auth API — POST /api/auth/send-otp

| Endpoint | Method | Payload | Status | Response | Time (ms) | Result |
|----------|--------|---------|--------|----------|-----------|--------|
| `/api/auth/send-otp` | POST | `{phone:"9876543210", countryCode:"+91", role:"rider"}` | 200 | `{success:true, data:{otp:"123456",...}}` | 154 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{phone:"9876543211", role:"driver"}` | 200 | `{success:true, ...}` | 51 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{phone:"123", role:"rider"}` | 422 | Validation failed: phone invalid | 57 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{phone:"9876543210"}` (missing role) | 422 | Validation failed | 24 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{phone:"9876543210", role:"admin"}` | 422 | Validation failed | 16 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{}` (empty body) | 422 | Validation failed | 15 | ✅ PASS |
| `/api/auth/send-otp` | POST | `{countryCode:"INVALID", ...}` | 422 | Validation failed | 16 | ✅ PASS |

### Auth API — POST /api/auth/verify-otp

| Endpoint | Method | Payload | Status | Response | Time (ms) | Result |
|----------|--------|---------|--------|----------|-----------|--------|
| `/api/auth/verify-otp` | POST | `{phone:"9876543210", otp:"123456", role:"rider"}` (new user) | 201 | `{success:true, data:{accessToken, refreshToken, isNewUser:true}}` | 50 | ✅ PASS |
| `/api/auth/verify-otp` | POST | Same (existing user) | 200 | `{success:true, data:{isNewUser:false}}` | 79 | ✅ PASS |
| `/api/auth/verify-otp` | POST | `{...otp:"000000"}` (wrong OTP) | 400 | `{success:false}` | 39 | ✅ PASS |
| `/api/auth/verify-otp` | POST | `{...otp:"123"}` (wrong length) | 422 | Validation failed | 35 | ✅ PASS |
| `/api/auth/verify-otp` | POST | `{otp:"123456", role:"driver"}` (new driver) | 201 | `{success:true, data:{role:"driver"}}` | 67 | ✅ PASS |

### Auth API — POST /api/auth/refresh & /logout

| Endpoint | Method | Payload | Status | Response | Time (ms) | Result |
|----------|--------|---------|--------|----------|-----------|--------|
| `/api/auth/refresh` | POST | `{refreshToken:"<valid>"}` | 200 | `{data:{accessToken:"<new>"}}` | 53 | ✅ PASS |
| `/api/auth/refresh` | POST | `{refreshToken:"invalid"}` | 401 | Unauthorized | 54 | ✅ PASS |
| `/api/auth/refresh` | POST | `{}` | 422 | Validation failed | 49 | ✅ PASS |
| `/api/auth/logout` | POST | — (with valid Bearer) | 200 | `{success:true}` | 53 | ✅ PASS |
| `/api/auth/logout` | POST | — (no token) | 401 | Unauthorized | 50 | ✅ PASS |

### Rider API — /api/rider/*

| Endpoint | Method | Auth | Payload | Status | Response | Time (ms) | Result |
|----------|--------|------|---------|--------|----------|-----------|--------|
| `/api/rider/profile` | GET | Rider token | — | 200 | `{data:{phone, name, email,...}}` | 100 | ✅ PASS |
| `/api/rider/profile` | GET | None | — | 401 | Unauthorized | 20 | ✅ PASS |
| `/api/rider/profile` | GET | Driver token | — | 403 | Access restricted to riders | 24 | ✅ PASS |
| `/api/rider/profile` | PUT | Rider token | `{name:"Updated"}` | 200 | Updated profile | 35 | ✅ PASS |
| `/api/rider/profile` | PUT | Rider token | `{email:"invalid"}` | 422 | Validation failed | 22 | ✅ PASS |
| `/api/rider/rides` | GET | Rider token | — | 200 | `{data:[]}` (empty) | 28 | ✅ PASS |
| `/api/rider/rides/:id` | GET | Rider token | — | 404 | Ride not found | 24 | ✅ PASS |
| `/api/rider/rides/:id` | GET | Rider token | — | 200 | Ride object | 44 | ✅ PASS |
| `/api/rider/fcm-token` | PUT | Rider token | `{fcmToken:"abc"}` | 200 | Token updated | 26 | ✅ PASS |
| `/api/rider/fcm-token` | PUT | Rider token | `{}` | 400 | fcmToken required | 26 | ✅ PASS |

### Driver API — /api/driver/*

| Endpoint | Method | Auth | Payload | Status | Response | Time (ms) | Result |
|----------|--------|------|---------|--------|----------|-----------|--------|
| `/api/driver/register` | POST | Driver token | `{name, vehicleType:"auto", vehicleModel, vehicleNumber}` | 200 | Registration submitted | 153 | ✅ PASS |
| `/api/driver/register` | POST | Driver token | `{name}` (missing fields) | 422 | Validation failed | 40 | ✅ PASS |
| `/api/driver/register` | POST | Driver token | `{vehicleType:"helicopter"}` | 422 | Invalid vehicle type | 35 | ✅ PASS |
| `/api/driver/register` | POST | Rider token | — | 403 | Access restricted | 26 | ✅ PASS |
| `/api/driver/profile` | GET | Verified driver | — | 200 | Driver profile | 30 | ✅ PASS |
| `/api/driver/profile` | GET | None | — | 401 | Unauthorized | 28 | ✅ PASS |
| `/api/driver/online-status` | PATCH | Verified driver | `{isOnline:false}` | 200 | Status updated | 38 | ✅ PASS |
| `/api/driver/online-status` | PATCH | Verified driver | `{}` | 422 | Validation failed | 35 | ✅ PASS |
| `/api/driver/online-status` | PATCH | Unverified driver | `{isOnline:true}` | 403 | Not verified | 31 | ✅ PASS |
| `/api/driver/location` | PATCH | Verified driver | `{lat:22.57, lng:88.36}` | 200 | Location updated | 37 | ✅ PASS |
| `/api/driver/location` | PATCH | Verified driver | `{lat:999, lng:999}` | 422 | Invalid coordinates | 29 | ✅ PASS |
| `/api/driver/rides` | GET | Verified driver | — | 200 | `[]` (empty) | 32 | ✅ PASS |
| `/api/driver/wallet` | GET | Verified driver | — | 200 | `{walletBalance, totalEarnings}` | 38 | ✅ PASS |
| `/api/driver/wallet/recharge` | POST | Verified driver | `{amount:200}` | 200 | Wallet recharged | 41 | ✅ PASS |
| `/api/driver/wallet/recharge` | POST | Verified driver | `{amount:0}` | 422 | Invalid amount | 28 | ✅ PASS |
| `/api/driver/fcm-token` | PUT | Verified driver | `{fcmToken:"xyz"}` | 200 | Token updated | 32 | ✅ PASS |

### Ride API — /api/rides/*

| Endpoint | Method | Auth | Payload | Status | Response | Time (ms) | Result |
|----------|--------|------|---------|--------|----------|-----------|--------|
| `/api/rides/fare-estimate` | GET | Rider token | `pickupLat=22.57&dropLat=22.6&vehicleType=auto` | 200 | Fare breakdown | 102 | ✅ PASS |
| `/api/rides/fare-estimate` | GET | None | — | 401 | Unauthorized | 26 | ✅ PASS |
| `/api/rides/active` | GET | Rider token | — | 200 | `{data:null}` (no ride) | 38 | ✅ PASS |
| `/api/rides/active` | GET | Rider token | — (with active ride) | 200 | Active ride object | 49 | ✅ PASS |
| `/api/rides/:rideId` | GET | Rider token | — | 404 | Ride not found | 28 | ✅ PASS |
| `/api/rides/:rideId` | GET | Rider token | — (rider's ride) | 200 | Ride details | 38 | ✅ PASS |
| `/api/rides/:rideId` | GET | Driver token | — (driver's ride) | 200 | Ride details | 41 | ✅ PASS |

---

## 3. Socket Event Execution Report

### Authentication Events

| Event | Payload | Response | Latency (ms) | Broadcast Type | Result |
|-------|---------|----------|--------------|----------------|--------|
| `connection` | `auth.token = <rider JWT>` | Connected | 339 | — | ✅ PASS |
| `connection` | `auth.token = <driver JWT>` | Connected | 155 | — | ✅ PASS |
| `connection` | No token | Error: "Authentication required" | 138 | — | ✅ PASS |
| `connection` | Invalid token | Error: "Invalid or expired token" | 152 | — | ✅ PASS |

### Rider Socket Events

| Event | Payload | Response | Latency (ms) | Broadcast Type | Result |
|-------|---------|----------|--------------|----------------|--------|
| `rider:ping` | — | `rider:pong {timestamp}` | 140 | Unicast to rider | ✅ PASS |
| `ride:search` | `{pickup, drop, vehicleType:"auto"}` | `{success:true, fareBreakdown, availableDrivers:[...]}` | 159 | Callback | ✅ PASS |
| `ride:book` | `{pickup, drop, vehicleType:"auto", paymentMethod:"cash"}` | `{success:true, rideId, otp, fareBreakdown, driver}` | 159 | Callback + driver notify | ✅ PASS |
| `ride:book` | Second booking (active ride exists) | `{success:false, error:"already have active ride"}` | 154 | Callback | ✅ PASS |
| `ride:cancel` | `{rideId, reason:"test"}` | `{success:true}` | 172 | Callback + driver notify | ✅ PASS |
| `ride:cancel` | `{rideId:<invalid>}` | `{success:false, error:"Cancellable ride not found"}` | 141 | Callback | ✅ PASS |
| `rider:cancel_search` | `{rideId:<invalid>}` | Silent (no crash) | 642 | — | ✅ PASS |

### Driver Socket Events

| Event | Payload | Response | Latency (ms) | Broadcast Type | Result |
|-------|---------|----------|--------------|----------------|--------|
| `driver:location_update` | `{lat:22.57, lng:88.36}` | DB updated, rider notified if in ride | 742 | Unicast to rider (if in ride) | ✅ PASS |
| `driver:location_update` | `{lat:999, lng:999}` | Silently ignored (validation) | 543 | — | ✅ PASS |
| `driver:reject_ride` | `{rideId:"..."}` | No response (log only) | 537 | — | ✅ PASS |
| `ride:accept` | `{rideId:<invalid>}` | `{success:false, error:"Ride no longer available"}` | 244 | Callback | ✅ PASS |
| `ride:arrived` | `{rideId:<invalid>}` | `{success:false, error:"Active ride not found"}` | 244 | Callback | ✅ PASS |
| `ride:verify_otp` | `{rideId:<invalid>, otp:"1234"}` | `{success:false, error:"Ride not found"}` | 243 | Callback | ✅ PASS |
| `ride:complete` | `{rideId:<invalid>}` | `{success:false, error:"Active ride not found"}` | 244 | Callback | ✅ PASS |
| `ride:cancel` | `{rideId:<invalid>}` | `{success:false}` | 242 | Callback | ✅ PASS |

### Full Ride Lifecycle (Socket)

| Step | Event | Payload | Response | Latency (ms) | Result |
|------|-------|---------|----------|--------------|--------|
| 1 | DB: Create ride `driver_assigned` | — | — | — | Setup |
| 2 | `ride:arrived` | `{rideId}` | `{success:true}` | ~244 | ✅ PASS |
| 3 | `ride:verify_otp` | `{rideId, otp:"5678"}` | `{success:true}` | ~244 | ✅ PASS |
| 4 | `ride:verify_otp` | `{rideId, otp:"0000"}` (wrong) | `{success:false, error:"Incorrect OTP"}` | ~361 | ✅ PASS |
| 5 | `ride:complete` | `{rideId}` | `{success:true, earning, platformFee}` | ~415 | ✅ PASS |
| 6 | DB: Verify status=`completed` | — | Confirmed | — | ✅ PASS |

### Multi-Client & Stress Tests

| Test | Description | Result |
|------|-------------|--------|
| Multiple simultaneous riders | 3 riders connecting at once | ✅ All connected |
| Rapid connect-disconnect | 3 cycles of connect → disconnect | ✅ Server stable |

---

## 4. Broken / Failed APIs

All APIs pass after bug fixes. Below are the **pre-fix failures** that were detected and corrected:

### 🐛 Bug 1 (Fixed): `ride.routes.ts` — Stale Import Causing TypeScript Compilation Error

**Severity:** CRITICAL — prevents TypeScript compilation  
**File:** `src/routes/ride.routes.ts:3`  
**Error:** `Module '"../controllers/ride.controller"' has no exported member 'bookRide'`  
**Root Cause:** Route file was importing `bookRide` which was removed from the controller (ride booking was moved to sockets), but the import was never cleaned up.  
**Fix:** Removed all unused imports from `ride.routes.ts`

### 🐛 Bug 2 (Fixed): `driver.socket.ts` `ride:accept` — `.lean()` + `.save()` Crash

**Severity:** CRITICAL — crashes on ride acceptance  
**File:** `src/sockets/driver.socket.ts:35`  
**Error:** `TypeError: ride.save is not a function`  
**Root Cause:** `Ride.findOne(...).lean()` returns a plain JavaScript object, not a Mongoose document. Calling `.save()` on it throws `TypeError`.  
**Fix:** Removed `.lean()` to get a proper Mongoose document that supports `.save()`

### 🐛 Bug 3 (Fixed): `ride.controller.ts` `getRide` — Incorrect Driver Authorization Check

**Severity:** HIGH — drivers unable to view their own rides via REST API  
**File:** `src/controllers/ride.controller.ts:128`  
**Error:** When `driverId` is populated (returns an object), `ride.driverId?.toString()` gives `[object Object]` instead of the ID string  
**Root Cause:** Inconsistent handling of populated vs. non-populated references  
**Fix:** Changed to `(ride.driverId as any)?._id?.toString() === req.user!.id`

### ⚠️ Minor: Duplicate MongoDB Index Warnings

**Severity:** LOW — performance warning, no functional impact  
**Files:** `src/models/User.ts:70`, `src/models/Driver.ts:153`  
**Error:** `[MONGOOSE] Warning: Duplicate schema index on {"phone":1} found`  
**Root Cause:** `phone: { unique: true }` automatically creates an index, plus `schema.index({ phone: 1 })` creates a duplicate  
**Fix:** Removed redundant explicit index declarations

---

## 5. Broken / Failed Socket Events

All socket events pass. Key observations during testing:

- `rider:cancel_search` event does not call a callback — if the ride doesn't exist, it silently returns. This is by design but callers have no confirmation.
- `driver:reject_ride` event has no server-side behavior beyond logging — rejection tracking is a known TODO.

---

## 6. Performance Insights

### API Response Times

| Category | Min (ms) | Max (ms) | Avg (ms) | Status |
|----------|----------|----------|----------|--------|
| Health checks | 9 | 66 | 37 | ✅ Fast |
| Auth endpoints | 15 | 154 | 52 | ✅ Good |
| Rider endpoints | 19 | 100 | 38 | ✅ Good |
| Driver endpoints | 23 | 153 | 43 | ✅ Good |
| Ride endpoints | 24 | 102 | 42 | ✅ Good |

### Socket Latency

| Event | Latency (ms) | Notes |
|-------|--------------|-------|
| `rider:ping → rider:pong` | 140 | Baseline heartbeat |
| `ride:search` | 159 | Includes DB query |
| `ride:book` | 154–172 | Creates ride + notifies driver |
| `driver:location_update` | 742 | **Slowest event** — DB write per update |
| `driver:reject_ride` | 537 | Just logging |
| Full lifecycle events | 244–415 | DB read+write+emit |

### Bottleneck Identified: `driver:location_update`

The location update event at **742ms** is the slowest. This is called frequently (every few seconds during a ride). **Recommendations:**
1. Use Redis for real-time location storage instead of MongoDB writes
2. Batch location updates (write to DB every 5–10 seconds, emit to rider immediately)
3. Consider geospatial streaming solutions for high-throughput scenarios

---

## 7. Security Issues (Observed During Runtime)

### 🔴 HIGH: OTP Rate Limiter Effectively Disabled

**File:** `src/routes/auth.routes.ts:20`  
```typescript
max: 5000000000000000000, // This is NOT a real rate limit
```
The OTP rate limiter has a maximum of 5 quintillion requests per 15 minutes — essentially unlimited. This allows brute-force attacks on OTP verification.  
**Fix:** Change to `max: 5` (5 requests per 15 minutes per IP)

### 🔴 HIGH: Global Rate Limiter Removed

**File:** `src/app.ts:36` (comment: "Global rate limiter")  
The global rate limiter was removed (see the empty comment block). Without it, all endpoints are vulnerable to DDoS.  
**Fix:** Add `express-rate-limit` middleware globally:
```typescript
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(globalLimiter);
```

### 🟡 MEDIUM: No Token Blocklist on Logout

**File:** `src/controllers/auth.controller.ts:241`  
```typescript
// TODO: Add token to Redis blocklist for true server-side invalidation.
```
Logout is purely client-side — tokens remain valid until expiry. A compromised token cannot be invalidated.  
**Fix:** Implement Redis-based JWT blocklist on logout

### 🟡 MEDIUM: JWT Secret Not Validated at Startup

**File:** `src/config/environment.ts:17-20`  
```typescript
MONGODB_URI: process.env.MONGODB_URI,  // Could be undefined
JWT_SECRET: process.env.JWT_SECRET,     // Could be undefined
```
The app starts without enforcing that `JWT_SECRET` and `MONGODB_URI` are set, allowing it to run with `undefined` secrets.  
**Fix:** Use the `required()` helper for all critical env vars

---

## 8. Code & Architecture Issues

### Architecture
- ✅ Good separation of concerns (controllers, services, models, middleware)
- ✅ Proper use of Socket.IO for real-time ride events
- ✅ OTP service correctly handles demo mode vs. production (Twilio)
- ✅ Haversine formula correctly implemented for distance calculation
- ⚠️ In-memory Maps (`riderSocketMap`, `driverSocketMap`) — not compatible with multi-process or load-balanced deployments. Use Redis instead.
- ⚠️ No request ID / correlation ID for tracing requests across logs
- ⚠️ `dev-seed.service.ts` is always imported in `server.ts` — seed code should not run in production

### Code Quality
- ⚠️ Multiple uses of `require()` inside async functions in socket handlers (instead of top-level imports)
- ⚠️ `ride.socket.ts` hardcodes seed phone numbers (`9000000001`–`9000000005`) in ride-search and ride-book logic
- ⚠️ Missing pagination on `GET /api/rider/rides` filter — only returns `status:"completed"` rides, omitting other statuses from history
- ⚠️ No input sanitization beyond express-validator (e.g., NoSQL injection protection)
- ⚠️ No request logging correlation for debugging specific user sessions

---

## 9. Recommendations (Actionable Fixes)

### Immediate (Critical)
1. **Fix OTP rate limiter**: Change `max: 5000000000000000000` to `max: 5` in `auth.routes.ts`
2. **Restore global rate limiter**: Add `express-rate-limit` globally in `app.ts`

### Short-term (High Priority)
3. **Redis for socket maps**: Replace `Map<string, string>` with Redis for `riderSocketMap` and `driverSocketMap`
4. **JWT blocklist**: Implement Redis-based token blocklist for proper logout
5. **Enforce required env vars**: Make `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI` required at startup
6. **Move seed service**: Guard `seedDevelopmentDrivers()` with `NODE_ENV !== 'production'` check
7. **Remove dynamic requires**: Move all `require()` calls inside socket handlers to top-level imports

### Medium-term (Performance)
8. **Location update optimization**: Buffer `driver:location_update` DB writes; emit to rider immediately but write to MongoDB every 5s
9. **Redis pub/sub**: Use Redis pub/sub for socket-to-socket communication across multiple server instances
10. **Add request IDs**: Use `express-request-id` or similar for distributed tracing

### Long-term (Scalability)
11. **Horizontal scaling**: Document that the in-memory socket maps prevent horizontal scaling — address with Redis adapter for Socket.IO
12. **Rate limiting**: Add per-user rate limits (not just per-IP) using JWT identity
13. **Monitoring**: Add health metrics (Prometheus/Grafana) to the `/health` endpoint

---

## 10. Final Scores (Out of 10)

| Category | Score | Notes |
|----------|-------|-------|
| **API Reliability** | 8.5/10 | All endpoints work; 3 bugs fixed; validation returns correct codes |
| **Socket Stability** | 8/10 | All events handled; no crashes; missing callback on some events |
| **Performance** | 7.5/10 | Under 500ms for all APIs; location updates at 742ms need optimization |
| **Security** | 5/10 | OTP limiter effectively disabled; no token blocklist; missing env validation |
| **Scalability** | 5.5/10 | In-memory socket maps prevent horizontal scaling; no Redis integration |
| **Overall** | **6.9/10** | Solid foundation with clear paths to production readiness |

---

## Appendix: Test Coverage

| Test File | Tests | Pass | Fail |
|-----------|-------|------|------|
| `tests/unit/fare.service.test.ts` | 15 | 15 | 0 |
| `tests/api/health.test.ts` | 6 | 6 | 0 |
| `tests/api/auth.test.ts` | 21 | 21 | 0 |
| `tests/api/rider.test.ts` | 14 | 14 | 0 |
| `tests/api/driver.test.ts` | 24 | 24 | 0 |
| `tests/api/ride.test.ts` | 9 | 9 | 0 |
| `tests/sockets/socket.test.ts` | 23 | 23 | 0 |
| **TOTAL** | **112** | **112** | **0** |
