// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { OrderActions } from "../src/payments/OrderActions";
import { ProtectedOrders } from "../src/merchant/ProtectedOrders";
import {
  loadResolution,
  saveResolution,
} from "../src/payments/resolution-pending";
import type { Doc } from "../convex/_generated/dataModel";
import type { WalletConnection } from "../src/lib/WalletControl";
import type { MerchantOrder } from "../src/merchant/client";

const mock = vi.hoisted(() => ({
  request: vi.fn(),
  sync: vi.fn(),
  read: vi.fn(),
  prepare: vi.fn(),
  resolve: vi.fn(),
  resolver: vi.fn(),
  send: vi.fn(),
  result: vi.fn(),
  validate: vi.fn(),
}));
vi.mock("../convex/_generated/api", () => ({
  api: { paymentActions: { requestRefund: "request", sync: "sync" } },
}));
// Use simple named references for this component integration test.
vi.mock("convex/react", () => ({
  useAction: (ref: string) => (ref === "request" ? mock.request : mock.sync),
}));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({
    readOrder: mock.read,
    prepareRefundRequest: mock.prepare,
    prepareResolution: mock.resolve,
    readResolver: mock.resolver,
  }),
}));
vi.mock("../src/merchant/client", () => ({
  connection: { sendRawTransaction: mock.send },
  exactAmount: (n: bigint) => String(n),
  explorer: () => "https://example.com",
}));
vi.mock("../src/merchant/transactions", () => ({
  transactionResult: (...args: unknown[]) => mock.result(...args),
  validateSignedTransaction: (...args: unknown[]) => mock.validate(...args),
}));

const buyer = Keypair.generate().publicKey.toBase58();
const merchant = Keypair.generate().publicKey.toBase58();
const resolver = Keypair.generate().publicKey;
const signature = bs58.encode(new Uint8Array(64).fill(1));
let root: Root,
  container: HTMLDivElement,
  link: Doc<"paymentLinks">,
  wallet: WalletConnection;
const current = vi.fn();
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label,
  );
const click = async (label: string) => {
  expect(button(label), label).toBeTruthy();
  await act(async () => button(label)!.click());
};
const render = async (active = wallet) => {
  await act(async () =>
    root.render(
      createElement(OrderActions, {
        link,
        active,
        isCurrent: current,
        setLocked: vi.fn(),
      }),
    ),
  );
};
const saved = () => ({
  signature,
  signer: buyer,
  lastValidBlockHeight: 100,
  action: "dispute" as const,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_ONCHAIN_DISPUTES", "true");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  link = {
    _id: "link",
    merchant,
    amount: "1000000",
    receipt: {
      order: buyer,
      buyer,
      status: "paid",
      reserveAmount: "50000",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    },
  } as Doc<"paymentLinks">;
  wallet = {
    account: { address: buyer },
    wallet: {
      signMessage: vi.fn().mockResolvedValue(new Uint8Array(64)),
      signTransaction: vi.fn().mockResolvedValue(new Uint8Array([1])),
    },
  } as unknown as WalletConnection;
  current.mockReturnValue(true);
  mock.resolver.mockResolvedValue(resolver);
  mock.read.mockImplementation(async () => ({ ...link.receipt }));
  mock.prepare.mockResolvedValue({
    transaction: { serialize: () => new Uint8Array([1]) },
    lastValidBlockHeight: 100,
  });
  mock.validate.mockReturnValue({ signature, bytes: new Uint8Array([1]) });
  mock.send.mockResolvedValue(signature);
  mock.result.mockResolvedValue("pending");
  mock.sync.mockResolvedValue(null);
  mock.request.mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("journals a dispute before broadcast and does not sign the reason before confirmation", async () => {
  mock.send.mockImplementation(async () => {
    expect(loadResolution("link")).toEqual(saved());
    throw new Error("RPC timeout");
  });
  await render();
  await click("Request refund");
  await click("Approve dispute in wallet");
  expect(mock.prepare).toHaveBeenCalledOnce();
  expect(mock.send).toHaveBeenCalledOnce();
  expect(wallet.wallet.signMessage).not.toHaveBeenCalled();
  expect(mock.request).not.toHaveBeenCalled();
  expect(loadResolution("link")?.action).toBe("dispute");
  expect(button("Request refund")?.disabled).toBe(true);
});
it("recovers a confirmed dispute after reload even when backend sync fails, then signs a reason", async () => {
  saveResolution("link", saved());
  mock.result.mockResolvedValue("confirmed");
  mock.sync.mockRejectedValue(new Error("offline"));
  mock.read.mockResolvedValue({ ...link.receipt, disputed: true });
  await render();
  expect(loadResolution("link")).toBeNull();
  expect(document.body.textContent).toContain("Disputed on-chain");
  await click("Add refund reason");
  await click("Sign refund reason");
  expect(mock.prepare).not.toHaveBeenCalled();
  expect(mock.request).toHaveBeenCalledOnce();
});
it("preserves an existing dispute when reason signing is cancelled, and allows retry", async () => {
  link.receipt!.disputed = true;
  link.receipt!.expiresAt = Date.now() - 1000;
  link.refundRequest = { reason: "unspecified", requestedAt: Date.now() };
  vi.mocked(wallet.wallet.signMessage!).mockRejectedValueOnce(
    new Error("User rejected the request"),
  );
  await render();
  await click("Add refund reason");
  await click("Sign refund reason");
  expect(document.body.textContent).toContain(
    "Your on-chain dispute remains active",
  );
  await click("Add refund reason");
  await click("Sign refund reason");
  expect(mock.request).toHaveBeenCalledOnce();
  expect(mock.prepare).not.toHaveBeenCalled();
});
it.each(["failed", "expired"])(
  "allows retry after a %s dispute transaction",
  async (result) => {
    saveResolution("link", saved());
    mock.result.mockResolvedValue(result);
    await render();
    expect(loadResolution("link")).toBeNull();
    expect(button("Request refund")?.disabled).toBe(false);
  },
);
it("rejects an account switch after wallet signing without broadcasting", async () => {
  vi.mocked(wallet.wallet.signTransaction!).mockImplementation(async () => {
    current.mockReturnValue(false);
    return new Uint8Array([1]);
  });
  await render();
  await click("Request refund");
  await click("Approve dispute in wallet");
  expect(mock.send).not.toHaveBeenCalled();
  expect(loadResolution("link")).toBeNull();
  expect(document.body.textContent).toContain("Your wallet changed");
});
it("does not sign a reason if the resolver already closed the order", async () => {
  link.receipt!.disputed = true;
  mock.read.mockResolvedValue({ ...link.receipt, status: "refunded" });
  await render();
  await click("Add refund reason");
  await click("Sign refund reason");
  expect(wallet.wallet.signMessage).not.toHaveBeenCalled();
  expect(mock.request).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("already resolved");
});
it("clears dispute recovery if the resolver closes the order before the next read", async () => {
  saveResolution("link", saved());
  mock.result.mockResolvedValue("confirmed");
  mock.read.mockResolvedValue({ ...link.receipt, status: "completed" });
  await render();
  expect(loadResolution("link")).toBeNull();
  expect(mock.prepare).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("already decided");
});
it("hides merchant completion for disputes and retains resolver actions", async () => {
  link.receipt!.disputed = true;
  link.receipt!.expiresAt = Date.now() - 1000;
  await render({
    ...wallet,
    account: { ...wallet.account, address: merchant },
  });
  expect(button("Complete order")).toBeUndefined();
  await render({
    ...wallet,
    account: { ...wallet.account, address: resolver.toBase58() },
  });
  expect(button("Complete order")).toBeTruthy();
  expect(button("Approve full refund")).toBeTruthy();
});
it("hides dashboard Release before Convex has synced a chain dispute", async () => {
  const order = {
    address: "order",
    reference: "ref",
    buyer,
    amount: 1000000n,
    reserveAmount: 50000n,
    createdAt: Date.now(),
    expiresAt: Date.now() - 1000,
    status: "paid",
    disputed: true,
  } as MerchantOrder;
  await act(async () =>
    root.render(
      createElement(ProtectedOrders, {
        orders: [order],
        loading: false,
        mismatch: false,
        titles: { ref: { id: "link", title: "Order", refundPending: false } },
      }),
    ),
  );
  expect(document.querySelector('[aria-label="Release Order"]')).toBeNull();
  expect(document.body.textContent).toContain("Disputed on-chain");
});
it("keeps the legacy flow until the program rollout flag is enabled", async () => {
  vi.stubEnv("VITE_ONCHAIN_DISPUTES", "false");
  await render();
  await click("Request refund");
  await click("Sign refund reason");
  expect(mock.prepare).not.toHaveBeenCalled();
  expect(mock.request).toHaveBeenCalledOnce();
});
it("lets an existing off-chain request acquire on-chain protection", async () => {
  link.refundRequest = { reason: "not_received", requestedAt: Date.now() };
  await render();
  await click("Protect refund request");
  await click("Approve dispute in wallet");
  expect(mock.prepare).toHaveBeenCalledOnce();
  expect(mock.request).not.toHaveBeenCalled();
});

it("advances an ambiguous broadcast to a confirmed dispute without sending twice", async () => {
  vi.useFakeTimers();
  mock.send.mockRejectedValue(new Error("RPC timeout"));
  await render();
  await click("Request refund");
  await click("Approve dispute in wallet");
  expect(loadResolution("link")).not.toBeNull();
  mock.result.mockResolvedValue("confirmed");
  mock.read.mockResolvedValue({ ...link.receipt, disputed: true });
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(loadResolution("link")).toBeNull();
  expect(mock.send).toHaveBeenCalledOnce();
  expect(button("Add refund reason")?.disabled).toBe(false);
});

it("allows a failed reason API call to retry without another dispute transaction", async () => {
  link.receipt!.disputed = true;
  mock.request.mockRejectedValueOnce(new Error("Service unavailable"));
  await render();
  await click("Add refund reason");
  await click("Sign refund reason");
  expect(document.body.textContent).toContain("Service unavailable");
  await click("Sign refund reason");
  expect(mock.request).toHaveBeenCalledTimes(2);
  expect(mock.prepare).not.toHaveBeenCalled();
});

it("refuses to submit a signed reason after switching wallets", async () => {
  link.receipt!.disputed = true;
  vi.mocked(wallet.wallet.signMessage!).mockImplementation(async () => {
    current.mockReturnValue(false);
    return new Uint8Array(64);
  });
  await render();
  await click("Add refund reason");
  await click("Sign refund reason");
  expect(mock.request).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Your wallet changed");
});

it("rejects an invalid journal without allowing a duplicate transaction", async () => {
  localStorage.setItem("reservepay:devnet:resolution:link", "{broken");
  await render();
  expect(button("Request refund")?.disabled).toBe(true);
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(mock.send).not.toHaveBeenCalled();
});
