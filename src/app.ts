import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/environment";
import { logger } from "./utils/logger";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

// Routes
import authRoutes from "./routes/auth.routes";
import riderRoutes from "./routes/rider.routes";
import driverRoutes from "./routes/driver.routes";
import rideRoutes from "./routes/ride.routes";
import adminRoutes from "./routes/admin.routes";

export function createApp(): Application {
  const app = express();

  // ── Security ─────────────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Global rate limiter (skip in test environment)
  if (env.NODE_ENV !== "test") {
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          message: "Too many requests. Please try again later.",
        },
      }),
    );
  }

  // ── Parsing ───────────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ── Logging ───────────────────────────────────────────────────────────────────
  if (env.NODE_ENV !== "test") {
    app.use(
      morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
        stream: { write: (msg) => logger.info(msg.trimEnd()) },
      }),
    );
  }

  // ── Health Check ──────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      message: "Pather Sathi API is running",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // Backward-compatible API health route
  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      message: "Pather Sathi API is running",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // ── API Routes ────────────────────────────────────────────────────────────────
  app.use("/api/auth", authRoutes);
  app.use("/api/rider", riderRoutes);
  app.use("/api/driver", driverRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/rides", rideRoutes);

  // ── 404 & Error Handling ──────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
