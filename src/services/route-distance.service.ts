import { env } from "../config/environment";
import { ICoordinate } from "../models/Ride";
import { calculateDistance } from "./fare.service";
import { logger } from "../utils/logger";

export interface RouteMetrics {
  distanceKm: number;
  durationMinutes: number;
  /** Always road-network distance in non-test environments. */
  distanceMode: "road" | "estimate";
  provider: "google" | "osrm" | "test";
  /** Encoded polyline of the driving route (Google/OSRM), when available. */
  polyline?: string;
}

const ROUTE_TIMEOUT_MS = 8_000;

function roundKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

function isValidCoordinate(point: ICoordinate): boolean {
  return (
    Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getGoogleRouteMetrics(
  pickup: ICoordinate,
  drop: ICoordinate,
): Promise<RouteMetrics> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${pickup.lat},${pickup.lng}`);
  url.searchParams.set("destination", `${drop.lat},${drop.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", env.GOOGLE_MAPS_SERVER_API_KEY);

  const body = await fetchJson(url.toString());
  const route = body.routes?.[0];
  if (body.status !== "OK" || !route?.legs?.length) {
    throw new Error(`Google Directions did not return a route: ${body.status || "NO_ROUTE"}`);
  }

  const totals = route.legs.reduce(
    (acc: { distanceMeters: number; durationSeconds: number }, leg: any) => ({
      distanceMeters: acc.distanceMeters + Number(leg.distance?.value || 0),
      durationSeconds: acc.durationSeconds + Number(leg.duration?.value || 0),
    }),
    { distanceMeters: 0, durationSeconds: 0 },
  );

  return {
    distanceKm: roundKm(totals.distanceMeters),
    durationMinutes: Math.max(1, Math.ceil(totals.durationSeconds / 60)),
    distanceMode: "road",
    provider: "google",
    polyline: route.overview_polyline?.points || undefined,
  };
}

async function getOsrmRouteMetrics(
  pickup: ICoordinate,
  drop: ICoordinate,
): Promise<RouteMetrics> {
  const coordinates = `${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}`;
  const base = env.OSRM_ROUTE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "polyline");
  url.searchParams.set("alternatives", "false");

  const body = await fetchJson(url.toString());
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route) {
    throw new Error(`OSRM did not return a route: ${body.code || "NO_ROUTE"}`);
  }

  return {
    distanceKm: roundKm(Number(route.distance || 0)),
    durationMinutes: Math.max(1, Math.ceil(Number(route.duration || 0) / 60)),
    distanceMode: "road",
    provider: "osrm",
    polyline: typeof route.geometry === "string" ? route.geometry : undefined,
  };
}

/**
 * Road-network driving distance/duration between two points.
 * Prefers Google Directions when GOOGLE_MAPS_SERVER_API_KEY is set,
 * otherwise (or on Google failure) uses OSRM.
 * Never returns pure aerial/haversine distance outside test mode.
 */
export async function getRoadRouteMetrics(
  pickup: ICoordinate,
  drop: ICoordinate,
): Promise<RouteMetrics> {
  if (!isValidCoordinate(pickup) || !isValidCoordinate(drop)) {
    throw new Error("Invalid pickup or drop coordinates");
  }

  if (env.NODE_ENV === "test") {
    const distanceKm = Math.max(
      0,
      Math.round(calculateDistance(pickup.lat, pickup.lng, drop.lat, drop.lng) * 1.2 * 100) /
        100,
    );
    return {
      distanceKm,
      durationMinutes: Math.max(1, Math.ceil((distanceKm / 20) * 60)),
      distanceMode: "estimate",
      provider: "test",
    };
  }

  const errors: string[] = [];

  if (env.GOOGLE_MAPS_SERVER_API_KEY) {
    try {
      const metrics = await getGoogleRouteMetrics(pickup, drop);
      logger.debug("Road distance via Google Directions", {
        distanceKm: metrics.distanceKm,
        durationMinutes: metrics.durationMinutes,
      });
      return metrics;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`google: ${message}`);
      logger.warn("Google Directions failed; falling back to OSRM", { error: message });
    }
  }

  try {
    const metrics = await getOsrmRouteMetrics(pickup, drop);
    logger.debug("Road distance via OSRM", {
      distanceKm: metrics.distanceKm,
      durationMinutes: metrics.durationMinutes,
    });
    return metrics;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`osrm: ${message}`);
    logger.error("Road routing failed for both providers", { errors });
    throw new Error(
      `Unable to calculate road distance (${errors.join("; ")}). ` +
        "Set a valid GOOGLE_MAPS_SERVER_API_KEY or ensure OSRM_ROUTE_URL is reachable.",
    );
  }
}
