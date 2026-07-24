import { getRoadRouteMetrics } from "../../src/services/route-distance.service";

describe("getRoadRouteMetrics", () => {
  it("returns test route metrics without using straight-line fare distance directly", async () => {
    const metrics = await getRoadRouteMetrics(
      { lat: 22.5726, lng: 88.3639 },
      { lat: 22.6, lng: 88.4 },
    );

    expect(metrics.provider).toBe("test");
    expect(metrics.distanceKm).toBeGreaterThan(0);
    expect(metrics.durationMinutes).toBeGreaterThan(0);
  });

  it("rejects invalid coordinates", async () => {
    await expect(
      getRoadRouteMetrics(
        { lat: 999, lng: 88.3639 },
        { lat: 22.6, lng: 88.4 },
      ),
    ).rejects.toThrow("Invalid pickup or drop coordinates");
  });
});
