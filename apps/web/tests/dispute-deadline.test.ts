// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MerchantDisputes } from "../src/merchant/MerchantDisputes";
import type { WalletConnection } from "../src/lib/WalletControl";

const data = vi.hoisted(() => ({ expiresAt: 0 }));
vi.mock("../src/payments/useResolver", () => ({
  useResolver: () => ({ resolver: "resolver", error: "", checking: false }),
}));
vi.mock("../src/payments/PaymentProvider", () => ({
  usePaymentsReady: () => true,
  PaymentBoundary: ({ children }: { children: unknown }) => children,
}));
vi.mock("../src/merchant/client", () => ({ exactAmount: () => "1" }));
vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  usePaginatedQuery: () => ({
    results: [
      {
        _id: "link",
        title: "Order",
        amount: "1000000",
        merchant: "merchant",
        receipt: { buyer: "buyer", expiresAt: data.expiresAt },
        refundRequest: { reason: "not_received" },
      },
    ],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  vi.useRealTimers();
});
it("marks the dispute overdue without a backend update or manual refresh", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  data.expiresAt = Date.now() + 20_000;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(MerchantDisputes, {
        active: { account: { address: "resolver" } } as WalletConnection,
      }),
    ),
  );
  expect(container.textContent).toContain("Under 1h left");
  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });
  expect(container.textContent).toContain("Overdue — decide now");
  expect(container.textContent).not.toContain("Under 1h left");
});
