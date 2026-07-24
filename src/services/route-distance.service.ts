import { env } from "../config/environment";
import { ICoordinate } from "../models/Ride";
import { calculateDistance } from "./fare.service";

export interface RouteMetrics {
  distanceKm: number;
  durationMinutes: number;
  provider: "google" | "osrm" | "test";
}

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

async function getGoogleRouteMetrics(
  pickup: ICoordinate,
  drop: ICoordinate,
): Promise<RouteMetrics> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${pickup.lat},${pickup.lng}`);
  url.searchParams.set("destination", `${drop.lat},${drop.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", env.GOOGLE_MAPS_SERVER_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Directions request failed with ${response.status}`);
  }

  const body = (await response.json()) as any;
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
    provider: "google",
  };
}

async function getOsrmRouteMetrics(
  pickup: ICoordinate,
  drop: ICoordinate,
): Promise<RouteMetrics> {
  const coordinates = `${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}`;
  const url = new URL(`${env.OSRM_ROUTE_URL}/${coordinates}`);
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM request failed with ${response.status}`);
  }

  const body = (await response.json()) as any;
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route) {
    throw new Error(`OSRM did not return a route: ${body.code || "NO_ROUTE"}`);
  }

  return {
    distanceKm: roundKm(Number(route.distance || 0)),
    durationMinutes: Math.max(1, Math.ceil(Number(route.duration || 0) / 60)),
    provider: "osrm",
  };
}

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
      Math.round(calculateDistance(pickup.lat, pickup.lng, drop.lat, drop.lng) * 1.2 * 100) / 100,
    );
    return {
      distanceKm,
      durationMinutes: Math.max(1, Math.ceil((distanceKm / 20) * 60)),
      provider: "test",
    };
  }

  if (env.GOOGLE_MAPS_SERVER_API_KEY) {
    return getGoogleRouteMetrics(pickup, drop);
  }

  return getOsrmRouteMetrics(pickup, drop);
}
