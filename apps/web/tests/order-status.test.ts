import { describe, expect, it } from "vitest";
import { isDisputed, orderStatus } from "../src/payments/order-status";

describe("orderStatus", () => {
  it("maps every on-chain variant explicitly", () => {
    expect(orderStatus({ open: {} })).toBe("paid");
    expect(orderStatus({ disputed: {} })).toBe("paid");
    expect(orderStatus({ completed: {} })).toBe("completed");
    expect(orderStatus({ refunded: {} })).toBe("refunded");
  });
  it("throws on unknown variants instead of guessing refunded", () => {
    expect(() => orderStatus({})).toThrow("Unknown order status");
    expect(() => orderStatus({ cancelled: {} })).toThrow("Unknown order status");
  });
  it("flags only the disputed variant", () => {
    expect(isDisputed({ disputed: {} })).toBe(true);
    expect(isDisputed({ open: {} })).toBe(false);
    expect(isDisputed({ completed: {} })).toBe(false);
    expect(isDisputed({ refunded: {} })).toBe(false);
  });
});
