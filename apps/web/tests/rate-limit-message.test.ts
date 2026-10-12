import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { ActionCtx } from "../convex/_generated/server";
import schema from "../convex/schema";
import { enforce } from "../convex/rateLimit";
import { rateLimitMessage } from "../src/lib/rate-limit";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

it("explains a refused sign-in or refund request in plain words", () => {
  const raw = "Too many requests. Try again in 42 seconds.";
  expect(rateLimitMessage(raw, "sign-in")).toBe(
    "You’ve tried to sign in several times in a short period. Please wait 42 seconds, then try again.",
  );
  expect(rateLimitMessage(raw, "refund")).toBe(
    "This order received several refund requests in a short period. Please wait 42 seconds, then try again.",
  );
});

it("says 1 second and 1 minute at the edges of the window", () => {
  expect(
    rateLimitMessage("Too many requests. Try again in 1 seconds.", "refund"),
  ).toContain("Please wait 1 second, then try again.");
  expect(
    rateLimitMessage("Too many requests. Try again in 60 seconds.", "refund"),
  ).toContain("Please wait 1 minute, then try again.");
});

it("passes every other message through unchanged", () => {
  for (const message of [
    "Only the buyer can dispute this order.",
    "Submit the on-chain dispute first.",
    // A Solana RPC 429, which the retry helpers handle; not our limiter.
    "429 Too Many Requests: Too many requests, slow down",
  ])
    expect(rateLimitMessage(message, "refund")).toBe(message);
});

it("recognizes the exact message the backend limiter sends", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const ctx = {
    runMutation: (reference: FunctionReference<"mutation">, args: unknown) =>
      t.mutation(reference, args as never),
  } as unknown as ActionCtx;
  await enforce(ctx, "signin", "wallet", 1, 60_000);
  vi.advanceTimersByTime(18_000);
  const error = await enforce(ctx, "signin", "wallet", 1, 60_000).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(ConvexError);
  expect(rateLimitMessage((error as ConvexError<string>).data, "sign-in")).toBe(
    "You’ve tried to sign in several times in a short period. Please wait 42 seconds, then try again.",
  );
});
