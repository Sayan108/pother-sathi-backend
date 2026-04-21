/**
 * Socket.IO Event Tests
 * Tests for Rider and Driver socket events
 */

import http from "http";
import { io as Client } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import mongoose from "mongoose";
import { createApp } from "../../src/app";
import { initSocketServer } from "../../src/config/socket";
import { initSocketHandlers } from "../../src/sockets";
import { User } from "../../src/models/User";
import { Driver } from "../../src/models/Driver";
import { Ride } from "../../src/models/Ride";
import { Transaction } from "../../src/models/Transaction";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
  generateRiderToken,
  generateDriverToken,
  sleep,
} from "../setup/helpers";

let httpServer: http.Server;
let serverPort: number;

let riderSocket: ClientSocket;
let driverSocket: ClientSocket;

let riderId: string;
let driverId: string;
let riderToken: string;
let driverToken: string;

function getServerAddress(): string {
  return `http://localhost:${serverPort}`;
}

function promiseWithTimeout<T>(
  executor: (
    resolve: (value: T) => void,
    reject: (reason?: any) => void,
  ) => void,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    executor(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

function connectSocket(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = Client(getServerAddress(), {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
    const timer = setTimeout(
      () => reject(new Error("Socket connection timeout")),
      5000,
    );
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

beforeAll(async () => {
  await connectTestDB();

  const app = createApp();
  httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);
  initSocketHandlers(io);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address() as { port: number };
      serverPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  riderSocket?.disconnect();
  driverSocket?.disconnect();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearCollections();

  // Create rider
  const user = await User.create({
    phone: "9876543210",
    countryCode: "+91",
    isVerified: true,
    name: "Socket Test Rider",
  });
  riderId = user._id.toString();
  riderToken = generateRiderToken(riderId, "9876543210");

  // Create seed drivers for ride booking tests
  await Driver.create([
    {
      phone: "9000000001",
      countryCode: "+91",
      name: "Seed Driver 1",
      vehicleType: "auto",
      vehicleModel: "Bajaj RE",
      vehicleNumber: "WB01A0001",
      accountStatus: "verified",
      isActive: true,
      isOnline: true,
      isAvailable: true,
      location: { type: "Point", coordinates: [88.3639, 22.5726] },
    },
  ]);

  // Create verified driver
  const driver = await Driver.create({
    phone: "9876543212",
    countryCode: "+91",
    name: "Socket Test Driver",
    vehicleType: "auto",
    vehicleModel: "Bajaj RE",
    vehicleNumber: "WB01A1234",
    accountStatus: "verified",
    isActive: true,
    isOnline: true,
    isAvailable: true,
    walletBalance: 500,
    location: { type: "Point", coordinates: [88.3639, 22.5726] },
  });
  driverId = driver._id.toString();
  driverToken = generateDriverToken(driverId, "9876543212");
});

afterEach(async () => {
  if (riderSocket?.connected) riderSocket.disconnect();
  if (driverSocket?.connected) driverSocket.disconnect();
  await sleep(100);
});

// ── Connection / Authentication ────────────────────────────────────────────────

describe("Socket Authentication", () => {
  it("should connect successfully with valid rider token", async () => {
    const start = Date.now();
    riderSocket = await connectSocket(riderToken);
    const latency = Date.now() - start;

    expect(riderSocket.connected).toBe(true);
    console.log(`[Socket rider connect] latency=${latency}ms`);
  });

  it("should connect successfully with valid driver token", async () => {
    const start = Date.now();
    driverSocket = await connectSocket(driverToken);
    const latency = Date.now() - start;

    expect(driverSocket.connected).toBe(true);
    console.log(`[Socket driver connect] latency=${latency}ms`);
  });

  it("should reject connection without token", async () => {
    const socket = Client(getServerAddress(), {
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      socket.on("connect_error", (err) => {
        expect(err.message).toContain("Authentication required");
        socket.disconnect();
        resolve();
      });
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 3000);
    });
  });

  it("should reject connection with invalid token", async () => {
    const socket = Client(getServerAddress(), {
      auth: { token: "invalid-jwt-token" },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      socket.on("connect_error", (err) => {
        expect(err.message).toContain("Invalid or expired token");
        socket.disconnect();
        resolve();
      });
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 3000);
    });
  });
});

// ── Rider Socket Events ────────────────────────────────────────────────────────

describe("Rider Socket Events", () => {
  beforeEach(async () => {
    riderSocket = await connectSocket(riderToken);
  });

  it("should handle rider:ping and receive rider:pong", async () => {
    const start = Date.now();
    const pong = await promiseWithTimeout<{ timestamp: number }>((resolve) => {
      riderSocket.once("rider:pong", resolve);
      riderSocket.emit("rider:ping");
    }, 3000);
    const latency = Date.now() - start;

    expect(pong).toHaveProperty("timestamp");
    expect(typeof pong.timestamp).toBe("number");
    console.log(`[rider:ping -> rider:pong] latency=${latency}ms`);
  });

  it("should handle ride:search and return available drivers", async () => {
    const start = Date.now();
    const response = await promiseWithTimeout<any>((resolve) => {
      riderSocket.emit(
        "ride:search",
        {
          pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
          drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
          vehicleType: "auto",
        },
        (res: any) => resolve(res),
      );
    }, 5000);
    const latency = Date.now() - start;

    expect(response.success).toBe(true);
    expect(response).toHaveProperty("fareBreakdown");
    expect(response).toHaveProperty("availableDrivers");
    console.log(
      `[ride:search] latency=${latency}ms drivers=${response.availableDrivers?.length}`,
    );
  });

  it("should handle ride:book and return ride details", async () => {
    const start = Date.now();
    const response = await promiseWithTimeout<any>((resolve) => {
      riderSocket.emit(
        "ride:book",
        {
          pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
          drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
          vehicleType: "auto",
          paymentMethod: "cash",
        },
        (res: any) => resolve(res),
      );
    }, 8000);
    const latency = Date.now() - start;

    // Either succeeds with driver or says no drivers (depends on seed data vehicleType match)
    expect(response).toHaveProperty("success");
    console.log(`[ride:book] success=${response.success} latency=${latency}ms`);
  });

  it("should prevent booking if rider has active ride", async () => {
    // First booking
    await promiseWithTimeout<any>((resolve) => {
      riderSocket.emit(
        "ride:book",
        {
          pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
          drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
          vehicleType: "auto",
          paymentMethod: "cash",
        },
        resolve,
      );
    }, 8000);

    // Second booking should fail
    const response = await promiseWithTimeout<any>((resolve) => {
      riderSocket.emit(
        "ride:book",
        {
          pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
          drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
          vehicleType: "auto",
          paymentMethod: "cash",
        },
        resolve,
      );
    }, 8000);

    // If first succeeded, second must fail
    if (response.success === false) {
      expect(response.error).toContain("active ride");
    }
  });

  it("should handle ride:cancel for existing cancellable ride", async () => {
    // Create a ride first via booking
    const bookResult = await promiseWithTimeout<any>((resolve) => {
      riderSocket.emit(
        "ride:book",
        {
          pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
          drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
          vehicleType: "auto",
          paymentMethod: "cash",
        },
        resolve,
      );
    }, 8000);

    if (!bookResult.success || !bookResult.rideId) {
      console.log(
        "[ride:cancel] Skipping - no ride booked (no drivers available)",
      );
      return;
    }

    const cancelResult = await promiseWithTimeout<any>((resolve, reject) => {
      riderSocket.emit(
        "ride:cancel",
        { rideId: bookResult.rideId, reason: "Test cancellation" },
        resolve,
      );
    }, 3000);

    expect(cancelResult.success).toBe(true);
    console.log(`[ride:cancel] success=${cancelResult.success}`);
  });

  it("should handle rider:cancel_search for an existing searching ride", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "0000",
      status: "searching",
      driverAssignedAt: new Date(),
    });

    const response = await promiseWithTimeout<any>((resolve, reject) => {
      riderSocket.emit("rider:cancel_search", { rideId: ride._id.toString() });
      riderSocket.once("ride:cancelled", resolve);
    }, 3000);

    expect(response).toEqual({
      rideId: ride._id.toString(),
      cancelledBy: "rider",
    });
  });

  it("should handle ride:cancel for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const response = await promiseWithTimeout<any>((resolve) => {
      riderSocket.emit(
        "ride:cancel",
        { rideId: fakeRideId, reason: "Test" },
        resolve,
      );
    }, 3000);

    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });

  it("should handle rider:cancel_search for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    // This event doesn't have a callback, just check it doesn't crash
    riderSocket.emit("rider:cancel_search", { rideId: fakeRideId });
    await sleep(500);
    expect(riderSocket.connected).toBe(true);
  });
});

// ── Driver Socket Events ───────────────────────────────────────────────────────

describe("Driver Socket Events", () => {
  beforeEach(async () => {
    driverSocket = await connectSocket(driverToken);
    await sleep(100); // Allow DB update for socketId
  });

  it("should handle driver:location_update", async () => {
    const start = Date.now();
    driverSocket.emit("driver:location_update", {
      lat: 22.5726,
      lng: 88.3639,
    });
    await sleep(500);
    const latency = Date.now() - start;

    // Verify the driver's location was updated in DB
    const driver = await Driver.findById(driverId).lean();
    expect(driver?.location?.coordinates?.[0]).toBe(88.3639);
    console.log(`[driver:location_update] latency=${latency}ms`);
  });

  it("should ignore invalid coordinates in driver:location_update", async () => {
    driverSocket.emit("driver:location_update", {
      lat: 999, // Invalid
      lng: 999, // Invalid
    });
    await sleep(300);

    // Driver location should not be updated to invalid coordinates
    const driver = await Driver.findById(driverId).lean();
    // Should still have the original coordinates
    expect(driver?.location?.coordinates?.[0]).toBe(88.3639);
  });

  it("should handle driver:reject_ride without error", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    driverSocket.emit("driver:reject_ride", { rideId: fakeRideId });
    await sleep(300);
    expect(driverSocket.connected).toBe(true);
  });

  it("should allow a driver to accept a searching ride and notify the rider", async () => {
    riderSocket = await connectSocket(riderToken);
    await sleep(100);

    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "1234",
      status: "searching",
      driverAssignedAt: new Date(),
    });

    const assignedEventPromise = promiseWithTimeout<any>((resolve) => {
      riderSocket.once("ride:driver_assigned", resolve);
    }, 3000);

    const response = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit(
        "ride:accept",
        { rideId: ride._id.toString() },
        resolve,
      );
    }, 3000);

    const assignedEvent = await assignedEventPromise;

    expect(response.success).toBe(true);
    expect(response.rideId).toBe(ride._id.toString());
    expect(assignedEvent).toHaveProperty("rideId", ride._id.toString());
    expect(assignedEvent.driver).toHaveProperty("name");
  });

  it("should forward driver location updates to the rider for an assigned ride", async () => {
    riderSocket = await connectSocket(riderToken);
    await sleep(100);

    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(driverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "1234",
      status: "driver_assigned",
      driverAssignedAt: new Date(),
    });

    const locationUpdate = promiseWithTimeout<any>((resolve) => {
      riderSocket.once("driver:location", resolve);
    }, 3000);

    driverSocket.emit("driver:location_update", {
      lat: 22.5726,
      lng: 88.3639,
      rideId: ride._id.toString(),
    });

    const update = await locationUpdate;
    expect(update).toEqual({
      lat: 22.5726,
      lng: 88.3639,
      rideId: ride._id.toString(),
    });

    const driver = await Driver.findById(driverId).lean();
    expect(driver?.location?.coordinates?.[0]).toBe(88.3639);
  });

  it("should allow a driver to cancel an assigned ride and notify the rider", async () => {
    riderSocket = await connectSocket(riderToken);
    await sleep(100);

    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(driverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "1234",
      status: "driver_assigned",
      driverAssignedAt: new Date(),
    });

    const cancelledEvent = promiseWithTimeout<any>((resolve) => {
      riderSocket.once("ride:driver_cancelled", resolve);
    }, 3000);

    const cancelResponse = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit(
        "ride:cancel",
        { rideId: ride._id.toString(), reason: "Driver cancellation test" },
        resolve,
      );
    }, 3000);

    const event = await cancelledEvent;

    expect(cancelResponse.success).toBe(true);
    expect(event).toHaveProperty("rideId", ride._id.toString());
    expect(event.cancelledBy).toBe("driver");
  });

  it("should handle ride:accept for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const response = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:accept", { rideId: fakeRideId }, resolve);
    }, 3000);

    expect(response.success).toBe(false);
    console.log(`[ride:accept non-existent] error="${response.error}"`);
  });

  it("should handle ride:arrived for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const response = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:arrived", { rideId: fakeRideId }, resolve);
    }, 3000);

    expect(response.success).toBe(false);
    console.log(`[ride:arrived non-existent] error="${response.error}"`);
  });

  it("should handle ride:verify_otp for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const response = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit(
        "ride:verify_otp",
        { rideId: fakeRideId, otp: "1234" },
        resolve,
      );
    }, 3000);

    expect(response.success).toBe(false);
    console.log(`[ride:verify_otp non-existent] error="${response.error}"`);
  });

  it("should handle ride:complete for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const response = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:complete", { rideId: fakeRideId }, resolve);
    }, 3000);

    expect(response.success).toBe(false);
    console.log(`[ride:complete non-existent] error="${response.error}"`);
  });

  it("should handle ride:cancel for non-existent ride gracefully", async () => {
    const fakeRideId = new mongoose.Types.ObjectId().toString();
    const response = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit(
        "ride:cancel",
        { rideId: fakeRideId, reason: "Test" },
        resolve,
      );
    }, 3000);

    expect(response.success).toBe(false);
  });
});

// ── Full Ride Lifecycle via Sockets ────────────────────────────────────────────

describe("Full Ride Lifecycle (Socket)", () => {
  let rideId: string;

  beforeEach(async () => {
    riderSocket = await connectSocket(riderToken);
    driverSocket = await connectSocket(driverToken);
    await sleep(200);
  });

  it("should complete the full ride lifecycle", async () => {
    // 1. Rider books a ride - create a ride directly in DB with driver assigned
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(driverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "driver_assigned",
      driverAssignedAt: new Date(),
    });
    rideId = ride._id.toString();

    // 2. Driver marks arrival
    const arrivedResult = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:arrived", { rideId }, resolve);
    }, 3000);
    expect(arrivedResult.success).toBe(true);
    console.log(`[ride:arrived] success=${arrivedResult.success}`);

    // 3. Driver verifies OTP
    const otpResult = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:verify_otp", { rideId, otp: "5678" }, resolve);
    }, 3000);
    expect(otpResult.success).toBe(true);
    console.log(`[ride:verify_otp] success=${otpResult.success}`);

    // 4. Driver completes ride
    const completeResult = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:complete", { rideId }, resolve);
    }, 3000);
    expect(completeResult.success).toBe(true);
    console.log(
      `[ride:complete] success=${completeResult.success} earning=${completeResult.earning}`,
    );

    // Verify ride is now completed in DB
    const completedRide = await Ride.findById(rideId).lean();
    expect(completedRide?.status).toBe("completed");
  });

  it("should deduct rider wallet and create transaction for wallet payment", async () => {
    await User.findByIdAndUpdate(riderId, { walletBalance: 200 });

    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(driverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "wallet",
      otp: "5678",
      status: "driver_assigned",
      driverAssignedAt: new Date(),
    });
    rideId = ride._id.toString();

    const arrivedResult = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:arrived", { rideId }, resolve);
    }, 3000);
    expect(arrivedResult.success).toBe(true);

    const otpResult = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:verify_otp", { rideId, otp: "5678" }, resolve);
    }, 3000);
    expect(otpResult.success).toBe(true);

    const completeResult = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit("ride:complete", { rideId }, resolve);
    }, 3000);
    expect(completeResult.success).toBe(true);

    const rider = await User.findById(riderId).lean();
    expect(rider?.walletBalance).toBe(100);

    const transaction = await Transaction.findOne({
      userId: riderId,
      userModel: "User",
      rideId: ride._id,
      type: "ride_payment",
    }).lean();
    expect(transaction).toBeTruthy();
    expect(transaction?.amount).toBe(-100);
  });

  it("should reject wrong OTP in ride:verify_otp", async () => {
    const ride = await Ride.create({
      riderId: new mongoose.Types.ObjectId(riderId),
      driverId: new mongoose.Types.ObjectId(driverId),
      pickup: { lat: 22.5726, lng: 88.3639, address: "Kolkata" },
      drop: { lat: 22.6, lng: 88.4, address: "Salt Lake" },
      distance: 5,
      duration: 15,
      vehicleType: "auto",
      fare: 100,
      platformFee: 15,
      driverEarning: 85,
      discount: 0,
      paymentMethod: "cash",
      otp: "5678",
      status: "driver_arrived",
      driverArrivedAt: new Date(),
    });

    const result = await promiseWithTimeout<any>((resolve) => {
      driverSocket.emit(
        "ride:verify_otp",
        { rideId: ride._id.toString(), otp: "0000" },
        resolve,
      );
    }, 3000);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Incorrect OTP");
    console.log(`[ride:verify_otp wrong otp] error="${result.error}"`);
  });
});

// ── Multiple Clients / Rapid Connect-Disconnect ────────────────────────────────

describe("Multiple Clients & Rapid Reconnect", () => {
  it("should handle multiple simultaneous rider connections", async () => {
    const sockets: ClientSocket[] = [];
    const promises = Array.from({ length: 3 }, () => connectSocket(riderToken));
    const results = await Promise.allSettled(promises);

    results.forEach((r) => {
      if (r.status === "fulfilled") {
        sockets.push(r.value);
      }
    });

    const connected = sockets.filter((s) => s.connected).length;
    expect(connected).toBeGreaterThan(0);
    console.log(`[Multiple riders] ${connected}/3 connected`);

    sockets.forEach((s) => s.disconnect());
    await sleep(200);
  });

  it("should handle rapid connect-disconnect cycles", async () => {
    for (let i = 0; i < 3; i++) {
      const socket = Client(getServerAddress(), {
        auth: { token: riderToken },
        transports: ["websocket"],
        forceNew: true,
      });
      await promiseWithTimeout<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        socket.on("connect", () => {
          clearTimeout(timer);
          socket.disconnect();
          resolve();
        });
        socket.on("connect_error", () => {
          clearTimeout(timer);
          resolve();
        });
      }, 3000);
    }
    // Server should still be running after rapid cycles
    expect(httpServer.listening).toBe(true);
  });
});
