// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BackgroundStatus,
  describeWorker,
} from "../src/merchant/BackgroundStatus";

const data = vi.hoisted(() => ({ startedAt: 0, finishedAt: 0 }));
vi.mock("../src/payments/PaymentProvider", () => ({
  usePaymentsReady: () => true,
}));
vi.mock("convex/react", () => ({
  useQuery: () => [
    { name: "reconcile", ...data, lastSuccessAt: data.finishedAt, issue: null },
  ],
}));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  vi.useRealTimers();
});
it("marks a stopped cron stale without a backend update", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  data.startedAt = data.finishedAt = Date.now();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(BackgroundStatus)));
  expect(container.textContent).toContain("Running normally");
  await act(async () => {
    vi.advanceTimersByTime(6 * 60_000 + 15_000);
  });
  expect(container.textContent).toContain("Updates delayed");
  expect(container.textContent).not.toContain("Running normally");
});
it("distinguishes unconfigured, failed, running and stuck workers", () => {
  const row = {
    name: "keeper" as const,
    startedAt: 1_000,
    finishedAt: 2_000,
    lastSuccessAt: null,
    issue: null,
  };
  expect(describeWorker({ ...row, startedAt: null }, 3_000)).toBe(
    "Waiting for first check",
  );
  expect(describeWorker({ ...row, issue: "unconfigured" }, 3_000)).toBe(
    "Not enabled",
  );
  expect(describeWorker({ ...row, issue: "low_funds" }, 3_000)).toBe(
    "Fee wallet needs funding",
  );
  expect(describeWorker({ ...row, issue: "failed" }, 3_000)).toBe(
    "Retrying after a problem",
  );
  expect(describeWorker({ ...row, finishedAt: null }, 3_000)).toBe("Checking");
  expect(describeWorker({ ...row, finishedAt: null }, 302_000)).toBe(
    "Updates delayed",
  );
});
