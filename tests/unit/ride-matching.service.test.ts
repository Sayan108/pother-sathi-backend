import {
  isFreshDriverLocation,
  isRideRequestExpired,
} from "../../src/services/ride-matching.service";

describe("ride matching helpers", () => {
  it("treats active requests older than the expiry window as expired", () => {
    const ride = {
      status: "requested",
      createdAt: new Date(Date.now() - 60_000),
    } as any;

    expect(isRideRequestExpired(ride)).toBe(true);
  });

  it("keeps non-pending rides out of request expiry checks", () => {
    const ride = {
      status: "driver_on_the_way",
      createdAt: new Date(Date.now() - 60_000),
    } as any;

    expect(isRideRequestExpired(ride)).toBe(false);
  });

  it("requires a fresh driver location timestamp", () => {
    expect(
      isFreshDriverLocation({
        locationUpdatedAt: new Date(Date.now() - 5_000),
      } as any),
    ).toBe(true);

    expect(
      isFreshDriverLocation({
        locationUpdatedAt: new Date(Date.now() - 60_000),
      } as any),
    ).toBe(false);
  });
});
