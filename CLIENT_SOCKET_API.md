# Real-Time Ride Booking API (Socket.io)

This backend now uses Socket.io for all ride actions. Use the following events in your client to interact with the ride system.

## Connect to Socket.io

```js
const socket = io("http://<your-server-url>", { auth: { token: "JWT_TOKEN" } });
```

## Rider Events

### 1. Search for Rides

```js
socket.emit(
  "ride:search",
  {
    pickup: { lat, lng, address },
    drop: { lat, lng, address },
    vehicleType: "bike" | "auto" | "toto" | "car" | "delivery",
    couponCode: "OPTIONAL",
  },
  (response) => {
    // response: { success, fareBreakdown, availableDrivers, error? }
  },
);
```

### 2. Book a Ride

```js
socket.emit(
  "ride:book",
  {
    pickup: { lat, lng, address },
    drop: { lat, lng, address },
    vehicleType: "bike",
    couponCode: "",
    paymentMethod: "cash", // or 'wallet', 'upi'
  },
  (response) => {
    // response: { success, rideId, otp, fareBreakdown, status, driver, error? }
  },
);
```

### 3. Cancel a Ride

```js
socket.emit(
  "ride:cancel",
  {
    rideId: "RIDE_ID",
    reason: "Optional reason",
  },
  (response) => {
    // response: { success, error? }
  },
);
```

### 4. Listen for Ride Status Updates

```js
socket.on("ride:driver_assigned", (data) => {
  /* ... */
});
socket.on("ride:driver_arrived", (data) => {
  /* ... */
});
socket.on("ride:started", (data) => {
  /* ... */
});
socket.on("ride:completed", (data) => {
  /* ... */
});
socket.on("ride:cancelled", (data) => {
  /* ... */
});
socket.on("ride:driver_cancelled", (data) => {
  /* ... */
});
```

## Driver Events

### 1. Accept a Ride

```js
socket.emit(
  "ride:accept",
  {
    rideId: "RIDE_ID",
  },
  (response) => {
    // response: { success, rideId, error? }
  },
);
```

### 2. Mark Arrival

```js
socket.emit(
  "ride:arrived",
  {
    rideId: "RIDE_ID",
  },
  (response) => {
    // response: { success, error? }
  },
);
```

### 3. Verify OTP to Start Ride

```js
socket.emit(
  "ride:verify_otp",
  {
    rideId: "RIDE_ID",
    otp: "1234",
  },
  (response) => {
    // response: { success, rideId, error? }
  },
);
```

### 4. Complete Ride

```js
socket.emit(
  "ride:complete",
  {
    rideId: "RIDE_ID",
  },
  (response) => {
    // response: { success, rideId, earning, platformFee, walletBalance, error? }
  },
);
```

### 5. Cancel Ride

```js
socket.emit(
  "ride:cancel",
  {
    rideId: "RIDE_ID",
    reason: "Optional reason",
  },
  (response) => {
    // response: { success, error? }
  },
);
```

### 6. Listen for Assignment

```js
socket.on("ride:assigned", (data) => {
  /* ... */
});
```

## Notes

- All ride actions (search, book, accept, cancel, etc.) are now real-time via sockets.
- Use the callback in each emit to handle the response.
- Listen for status events to update the UI in real time.
- Authenticate with JWT in the socket connection.
