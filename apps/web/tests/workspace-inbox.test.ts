// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceInbox } from "../src/merchant/WorkspaceInbox";
import type { MerchantSession } from "../src/lib/useMerchantSession";
import type { WalletConnection } from "../src/lib/WalletControl";

const mock = vi.hoisted(() => ({ markRead: vi.fn(), read: false }));
vi.mock("../src/payments/PaymentProvider", () => ({
  usePaymentsReady: () => true,
  paymentsConfigured: true,
}));
vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args: unknown) =>
    args === "skip" ? undefined : { count: mock.read ? 0 : 1, more: false },
  useMutation: () => mock.markRead,
  usePaginatedQuery: (_ref: unknown, args: { session: string }) => ({
    results: [
      {
        _id: "notification",
        _creationTime: Date.now(),
        wallet: args.session,
        linkId: "receipt-id",
        kind: "refund_requested",
        title: `Order for ${args.session}`,
        expiresAt: Date.now() + 1000,
        ...(mock.read ? { readAt: Date.now() } : {}),
      },
    ],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));
let root: Root;
let container: HTMLDivElement;
const active = {
  account: { address: "wallet" },
  wallet: { signMessage: vi.fn() },
} as unknown as WalletConnection;
const session = (token: string | null): MerchantSession => ({
  token,
  status: token ? "signed-in" : "signed-out",
  signIn: vi.fn(),
  signOut: vi.fn(),
  expire: vi.fn(),
});
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((el) =>
    el.textContent?.includes(text),
  )!;
const open = async () => {
  await act(async () =>
    (
      document.querySelector(
        'button[aria-label^="Inbox,"]',
      ) as HTMLButtonElement
    ).click(),
  );
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.read = false;
  mock.markRead.mockReset();
  mock.markRead.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("does not mark messages read just by opening the inbox; supports explicit read", async () => {
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-a") }),
    ),
  );
  await open();
  expect(document.body.textContent).toContain("Order for wallet-a");
  expect(mock.markRead).not.toHaveBeenCalled();
  expect(document.querySelector('a[href="/pay/receipt-id"]')).not.toBeNull();
  mock.markRead.mockImplementation(async () => {
    mock.read = true;
  });
  await act(async () => button("Mark read").click());
  expect(mock.markRead).toHaveBeenCalledWith({
    session: "wallet-a",
    ids: ["notification"],
  });
  expect(document.body.textContent).not.toContain("Unread");
});
it("shows mutation failure and leaves the update unread for retry", async () => {
  mock.markRead.mockRejectedValueOnce(new Error("offline"));
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-a") }),
    ),
  );
  await open();
  await act(async () => button("Mark read").click());
  expect(document.body.textContent).toContain(
    "Could not mark these updates as read",
  );
  expect(document.body.textContent).toContain("Unread");
  expect(button("Mark read").disabled).toBe(false);
});
it("removes private updates on sign-out while the inbox is open", async () => {
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-a") }),
    ),
  );
  await open();
  expect(document.body.textContent).toContain("Order for wallet-a");
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session(null) }),
    ),
  );
  expect(document.body.textContent).not.toContain("Order for wallet-a");
  expect(document.body.textContent).toContain("Sign in to your inbox");
});

it("ignores a late session failure from the previous wallet", async () => {
  let reject!: (error: Error) => void;
  mock.markRead.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const previous = session("wallet-a");
  await act(async () =>
    root.render(createElement(WorkspaceInbox, { active, session: previous })),
  );
  await open();
  await act(async () => button("Mark read").click());
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-b") }),
    ),
  );
  await act(async () => reject(new Error("Sign in again.")));
  expect(previous.expire).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Order for wallet-b");
  expect(document.body.textContent).not.toContain("Order for wallet-a");
});
