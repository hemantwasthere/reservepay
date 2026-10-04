import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import {
  isTransient,
  isRateLimited,
  releasesRateLimitSlot,
  withRetry,
} from "../src/lib/retry";

// The shape web3.js 1.98 actually throws from getAccountInfo: the HTTP or
// fetch error is wrapped with the account, whose base58 may contain "429".
const ACCOUNT = "4Zx429kQ7VbG2mLwz3HhC9pU1sRtYnE8aJfD6oXcBqMv";
const wrapped = (inner: string) =>
  `failed to get info about account ${ACCOUNT}: Error: ${inner}`;

describe("isTransient", () => {
  it.each([
    "429 Too Many Requests: you are rate limited",
    "429 : rate limited", // HTTP/2: empty status text
    "502 Bad Gateway: upstream error",
    "503 Service Unavailable: try again",
    "504 Gateway Timeout",
    "Too many requests, slow down",
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
    "fetch failed",
    "socket hang up",
    "read ECONNRESET",
    "connect ETIMEDOUT 1.2.3.4:443",
    wrapped("429 Too Many Requests: rate limited"),
    wrapped("429 : rate limited"),
    wrapped("503 Service Unavailable: upstream"),
    `failed to get info about account ${ACCOUNT}: TypeError: fetch failed`,
  ])("retries: %s", (message) => {
    expect(isTransient(new Error(message))).toBe(true);
  });
  it.each([
    // 429 inside a base58 account, not an HTTP status
    "failed to get info about account 4Zx429abc: invalid param",
    "The on-chain order does not match this payment link. Do not send another payment.",
    "Merchant account does not match this wallet.",
    "custom program error: 0x1770",
    "RPC unavailable",
    "This payment link has already been paid.",
  ])("does not retry: %s", (message) => {
    expect(isTransient(new Error(message))).toBe(false);
  });
  it("never retries a ConvexError, even with a transient-looking message", () => {
    expect(isTransient(new ConvexError("429 Too Many Requests"))).toBe(false);
  });
});

describe("isRateLimited", () => {
  it.each([
    "429 Too Many Requests: you are rate limited",
    "429 : rate limited", // HTTP/2: empty status text
    "Too many requests, slow down",
    wrapped("429 Too Many Requests: rate limited"),
    wrapped("429 : rate limited"),
  ])("matches: %s", (message) => {
    expect(isRateLimited(new Error(message))).toBe(true);
  });
  it.each([
    "502 Bad Gateway: upstream error",
    "503 Service Unavailable: try again",
    "Failed to fetch",
    // 429 inside a base58 account, not an HTTP status
    "failed to get info about account 4Zx429abc: invalid param",
    "The on-chain order does not match this payment link. Do not send another payment.",
    wrapped("503 Service Unavailable: upstream"),
    `failed to get info about account ${ACCOUNT}: TypeError: fetch failed`,
  ])("does not match: %s", (message) => {
    expect(isRateLimited(new Error(message))).toBe(false);
  });
  it("never matches a ConvexError", () => {
    expect(isRateLimited(new ConvexError("429 Too Many Requests"))).toBe(false);
  });
});

describe("withRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("retries transient failures with bounded full-jitter backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // worst-case jitter
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue("ok");
    const promise = withRetry(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    // Worst case with the defaults: 0.4 + 0.8 + 1.6 = 2.8s of extra wait.
    await vi.advanceTimersByTimeAsync(400);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1599);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(4);
    await expect(promise).resolves.toBe("ok");
  });
  it("gives up after the configured retries and rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const promise = withRetry(fn);
    const assertion = expect(promise).rejects.toThrow("Failed to fetch");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(4);
  });
  it("does not retry deterministic errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(
        new Error("The on-chain order does not match this payment link."),
      );
    await expect(withRetry(fn)).rejects.toThrow("does not match");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("stops waiting when the signal aborts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const controller = new AbortController();
    const promise = withRetry(fn, { signal: controller.signal });
    const assertion = expect(promise).rejects.toThrow("aborted");
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("never starts when the signal is already aborted", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRetry(fn, { signal: controller.signal }),
    ).rejects.toThrow("aborted");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("releasesRateLimitSlot", () => {
  it.each([
    wrapped("502 Bad Gateway: upstream"),
    wrapped("503 Service Unavailable: upstream"),
    wrapped("503 : upstream"),
    wrapped("504 Gateway Timeout: upstream"),
    `failed to get info about account ${ACCOUNT}: TypeError: fetch failed`,
    "Failed to fetch",
  ])("releases on server or network failure: %s", (message) => {
    expect(releasesRateLimitSlot(new Error(message))).toBe(true);
  });
  it.each([
    wrapped("429 Too Many Requests: rate limited"),
    wrapped("429 : rate limited"),
    "Too many requests, slow down",
    "The on-chain order does not match this payment link. Do not send another payment.",
    wrapped("500 Internal Server Error: boom"),
    "custom program error: 0x1770",
  ])("keeps the slot otherwise: %s", (message) => {
    expect(releasesRateLimitSlot(new Error(message))).toBe(false);
  });
  it("keeps the slot for a ConvexError", () => {
    expect(
      releasesRateLimitSlot(new ConvexError("503 Service Unavailable")),
    ).toBe(false);
  });
});
