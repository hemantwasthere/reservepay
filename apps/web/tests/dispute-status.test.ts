// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import type { Doc } from "../convex/_generated/dataModel";
import type { WalletConnection } from "../src/lib/WalletControl";
import { CheckoutApp } from "../src/payments/CheckoutApp";
import { PaymentLinks } from "../src/payments/PaymentLinks";

const data = vi.hoisted(() => ({ link: null as unknown }));
vi.mock("convex/react", () => ({
  useQuery: (fn: Parameters<typeof getFunctionName>[0], args: unknown) =>
    args !== "skip" && getFunctionName(fn) === "payments:get"
      ? data.link
      : null,
  usePaginatedQuery: () => ({
    results: [data.link],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
  useAction: () => vi.fn().mockResolvedValue(null),
  useMutation: () => vi.fn(),
}));
vi.mock("../src/lib/Theme", () => ({ ThemeControl: () => null }));
vi.mock("../src/lib/Toast", () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock("../src/lib/WalletControl", () => ({ WalletControl: () => null }));
vi.mock("../src/payments/PaymentProvider", () => ({
  PaymentBoundary: ({ children }: { children: ReactNode }) => children,
  usePaymentsReady: () => true,
  paymentsConfigured: true,
}));
vi.mock("../src/payments/OrderActions", () => ({ OrderActions: () => null }));
vi.mock("../src/payments/chain", () => ({ paymentClient: () => ({}) }));
vi.mock("../src/merchant/client", () => ({
  connection: {},
  exactAmount: () => "1",
  parseAmount: vi.fn(),
  explorer: () => "#",
}));

const merchant = "11111111111111111111111111111111";
// An order whose protection ended an hour ago.
const order = (
  receipt: Partial<NonNullable<Doc<"paymentLinks">["receipt"]>> = {},
  link: Partial<Doc<"paymentLinks">> = {},
) =>
  ({
    _id: "link",
    _creationTime: Date.now(),
    merchant,
    title: "Design consultation",
    amount: "1250000",
    protectionSeconds: 3600,
    receipt: {
      order: "order",
      buyer: "buyer",
      reserveAmount: "62500",
      createdAt: Date.now() - 7_200_000,
      expiresAt: Date.now() - 3_600_000,
      status: "paid",
      ...receipt,
    },
    ...link,
  }) as Doc<"paymentLinks">;
const requested = {
  refundPending: true,
  refundRequest: { reason: "not_received" as const, requestedAt: Date.now() },
};

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const receipt = async (link: Doc<"paymentLinks">) => {
  data.link = link;
  history.replaceState(null, "", `/pay/${link._id}`);
  await act(async () => root.render(createElement(CheckoutApp)));
  return container.textContent ?? "";
};
const merchantLinks = async (link: Doc<"paymentLinks">) => {
  data.link = link;
  await act(async () =>
    root.render(
      createElement(PaymentLinks, {
        active: {
          account: { address: merchant },
          wallet: {},
        } as unknown as WalletConnection,
        session: "session",
        onSessionExpired: vi.fn(),
        registered: true,
        locked: false,
        setLocked: vi.fn(),
        isCurrent: () => true,
        onPaid: vi.fn(),
      }),
    ),
  );
  return container.textContent ?? "";
};

it("shows an on-chain dispute in the receipt status", async () => {
  expect(await receipt(order({ disputed: true }, requested))).toContain(
    "Paid · disputed on-chain",
  );
});

it.each([
  ["paid", "Paid"],
  ["completed", "Completed"],
  ["refunded", "Refunded"],
] as const)("labels a %s receipt as %s", async (status, label) => {
  const text = await receipt(order({ status }));
  expect(text).toContain(`Status${label}Received`);
});

it("never shows a disputed order as 'period ended' in the merchant's links", async () => {
  const text = await merchantLinks(order({ disputed: true }, requested));
  expect(text).toContain("Disputed on-chain · awaiting resolver");
  expect(text).toContain("Paid · disputed");
  expect(text).not.toContain("period ended");
  expect(text).not.toContain("Refund requested");
});

it("keeps the off-chain wording for an undisputed request", async () => {
  const text = await merchantLinks(
    order({ expiresAt: Date.now() + 3_600_000 }, requested),
  );
  expect(text).toContain("Refund requested · awaiting resolver");
  expect(text).toContain("Paid · protected");
});
