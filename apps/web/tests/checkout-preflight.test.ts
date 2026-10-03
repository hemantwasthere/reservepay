// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { CheckoutApp } from "../src/payments/CheckoutApp";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  sync: vi.fn(),
  prepare: vi.fn(),
  sign: vi.fn(),
  send: vi.fn(),
  save: vi.fn(),
  notify: vi.fn(),
  result: vi.fn(),
  journal: null as unknown,
  cached: {
    title: "Active cached link",
    amount: "1000000",
    protectionSeconds: 86400,
    merchant: "11111111111111111111111111111111",
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (fn: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(fn) === "payments:get" ? mocks.cached : null,
  useAction: (fn: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(fn) === "paymentActions:requirePayable"
      ? mocks.check
      : mocks.sync,
}));
vi.mock("../src/lib/Theme", () => ({ ThemeControl: () => null }));
vi.mock("../src/lib/Toast", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));
vi.mock("../src/lib/WalletControl", () => ({
  WalletControl: ({ onChange }: { onChange: (wallet: unknown) => void }) => {
    useEffect(
      () =>
        onChange({
          account: { address: "So11111111111111111111111111111111111111112" },
          wallet: { identity: "test", signTransaction: mocks.sign },
        }),
      [onChange],
    );
    return null;
  },
}));
vi.mock("../src/payments/PaymentProvider", () => ({
  PaymentBoundary: ({ children }: { children: ReactNode }) => children,
  usePaymentsReady: () => true,
  paymentsConfigured: true,
}));
vi.mock("../src/payments/OrderActions", () => ({ OrderActions: () => null }));
vi.mock("../src/merchant/client", () => ({
  connection: { sendRawTransaction: mocks.send },
  exactAmount: () => "1",
  explorer: () => "#",
}));
vi.mock("../src/merchant/transactions", () => ({
  validateSignedTransaction: () => ({
    signature: "signed",
    bytes: new Uint8Array([1]),
  }),
  transactionResult: mocks.result,
}));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({ prepare: mocks.prepare }),
}));
vi.mock("../src/payments/pending", () => ({
  loadPayment: () => mocks.journal,
  savePayment: (value: string, record: unknown) => {
    mocks.journal = record;
    mocks.save(value, record);
  },
  clearPayment: () => {
    mocks.journal = null;
  },
  paymentKey: (id: string) => `reservepay:devnet:checkout:${id}`,
}));
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.journal = null;
  mocks.result.mockResolvedValue("pending");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  history.replaceState(null, "", "/pay/test-link");
  mocks.check.mockResolvedValue(null);
  mocks.sync.mockResolvedValue(false);
  mocks.prepare.mockResolvedValue({
    transaction: { serialize: () => new Uint8Array([1]) },
    lastValidBlockHeight: 100,
  });
  mocks.sign.mockResolvedValue(new Uint8Array([1]));
  mocks.send.mockResolvedValue("signed");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(CheckoutApp)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function pay() {
  const button = container.querySelector<HTMLButtonElement>(".checkout-pay")!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

it("blocks a stale active checkout before wallet signing when the server rejects it", async () => {
  mocks.check.mockRejectedValue(
    new Error("This payment link is no longer active."),
  );
  await pay();
  expect(mocks.check).toHaveBeenCalledWith({ id: "test-link" });
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.sign).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it.each(["This payment link is no longer active.", "Connection unavailable"])(
  "does not persist or broadcast if the post-signature server check fails: %s",
  async (message) => {
    mocks.check
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error(message));
    await pay();
    expect(mocks.check).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(container.textContent).toContain(message);
  },
);
it("awaits the post-signature response before persisting and broadcasting", async () => {
  let resolve!: () => void;
  mocks.check.mockResolvedValueOnce(null).mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  await pay();
  expect(mocks.sign).toHaveBeenCalledTimes(1);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  await act(async () => resolve());
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.send.mock.invocationCallOrder[0],
  );
});

it.each([
  ["failed", "resolve"],
  ["failed", "reject"],
  ["expired", "resolve"],
  ["expired", "reject"],
] as const)(
  "keeps retry available after %s when the late send response is %s",
  async (terminal, response) => {
    let finishSend!: () => void;
    mocks.send.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          finishSend =
            response === "resolve"
              ? resolve
              : () => reject(new Error("RPC response lost"));
        }),
    );
    mocks.result.mockResolvedValue(terminal);
    await pay();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.result).toHaveBeenCalled();
    expect(mocks.journal).toBeNull();
    const message =
      terminal === "failed"
        ? "The transaction failed."
        : "The transaction expired";
    expect(container.textContent).toContain(message);
    await act(async () => finishSend());
    const button = container.querySelector<HTMLButtonElement>(".checkout-pay")!;
    expect(button.disabled).toBe(false);
    expect(container.textContent).toContain(message);
    expect(container.textContent).not.toContain(
      "Waiting for Solana confirmation",
    );
    // The enabled control must really start a new attempt.
    mocks.send.mockResolvedValue("signed");
    mocks.result.mockResolvedValue("pending");
    await pay();
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  },
);
it.each(["resolve", "reject"])(
  "preserves confirmed progress when the late send response is %s",
  async (response) => {
    let finishSend!: () => void;
    mocks.send.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          finishSend =
            response === "resolve"
              ? resolve
              : () => reject(new Error("RPC response lost"));
        }),
    );
    mocks.result.mockResolvedValue("confirmed");
    await pay();
    expect(container.textContent).toContain("Verifying the finalized order");
    await act(async () => finishSend());
    expect(container.textContent).toContain("Verifying the finalized order");
    expect(
      container.querySelector<HTMLButtonElement>(".checkout-pay")!.disabled,
    ).toBe(true);
    expect(mocks.journal).not.toBeNull();
  },
);
it.each(["resolve", "reject"])(
  "starts confirmation when send returns %s before polling advances",
  async (response) => {
    // Hold the next poll so the send handler owns the initial transition.
    mocks.sync.mockImplementation(() => new Promise(() => {}));
    if (response === "reject")
      mocks.send.mockRejectedValue(new Error("RPC response lost"));
    await pay();
    expect(container.textContent).toContain(
      response === "resolve"
        ? "Waiting for Solana confirmation"
        : "Submission is uncertain",
    );
    expect(
      container.querySelector<HTMLButtonElement>(".checkout-pay")!.disabled,
    ).toBe(true);
    expect(mocks.journal).not.toBeNull();
  },
);
it("decline does not save or send and allows retry", async () => {
  mocks.sign.mockRejectedValue({ code: 4001, message: "User rejected" });
  await pay();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    "Nothing was sent and no funds moved",
  );
  expect(
    container.querySelector<HTMLButtonElement>(".checkout-pay")!.disabled,
  ).toBe(false);
});
