import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { trackWorker } from "../convex/trackWorker";
import type { ActionCtx } from "../convex/_generated/server";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

it("reports unknown status before the first run without exposing internal fields", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.workers.status, {})).toEqual(
    ["reconcile", "keeper"].map((name) => ({
      name,
      startedAt: null,
      finishedAt: null,
      lastSuccessAt: null,
      issue: null,
    })),
  );
});

it("preserves the last success through failures and ignores older overlapping completions", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const name = "reconcile";
  const first = await t.mutation(internal.workers.start, { name });
  await t.mutation(internal.workers.finish, {
    name,
    generation: first,
    issue: null,
  });
  const success = Date.now();
  vi.advanceTimersByTime(120_000);
  const older = await t.mutation(internal.workers.start, { name });
  const newer = await t.mutation(internal.workers.start, { name });
  await t.mutation(internal.workers.finish, {
    name,
    generation: newer,
    issue: "failed",
  });
  await t.mutation(internal.workers.finish, {
    name,
    generation: older,
    issue: null,
  });
  const [status] = await t.query(api.workers.status, {});
  expect(status).toEqual({
    name,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    lastSuccessAt: success,
    issue: "failed",
  });
  expect(
    await t.run((ctx) => ctx.db.query("workerHealth").collect()),
  ).toHaveLength(1);
});

it("persists unexpected action failure and sanitizes the thrown error", async () => {
  const t = convexTest(schema, modules);
  const ctx = {
    runMutation: t.mutation,
  } as unknown as ActionCtx;
  await expect(
    trackWorker(ctx, "reconcile", async () => {
      throw new Error("https://rpc.example/private-secret");
    }),
  ).rejects.toThrow(
    "reconcile: background run failed; retrying next scheduled run.",
  );
  expect((await t.query(api.workers.status, {}))[0]).toMatchObject({
    issue: "failed",
    finishedAt: expect.any(Number),
    lastSuccessAt: null,
  });
});
