import { describe, expect, it } from "vitest";
import { nextDelay } from "../src/lib/backoff";

describe("nextDelay", () => {
  it("doubles from the base and caps at the max", () => {
    expect([0, 1, 2, 3, 4, 5].map((failures) => nextDelay(failures, 10, 60)))
      .toEqual([10, 20, 40, 60, 60, 60]);
  });
  it("scales with the base for the receipt cadence", () => {
    expect(nextDelay(0, 30_000, 120_000)).toBe(30_000);
    expect(nextDelay(1, 30_000, 120_000)).toBe(60_000);
    expect(nextDelay(2, 30_000, 120_000)).toBe(120_000);
    expect(nextDelay(3, 30_000, 120_000)).toBe(120_000);
  });
});
