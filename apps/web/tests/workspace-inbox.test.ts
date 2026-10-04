// @vitest-environment happy-dom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceInbox } from "../src/merchant/WorkspaceInbox";
import type { MerchantSession } from "../src/lib/useMerchantSession";
import type { WalletConnection } from "../src/lib/WalletControl";

const mock = vi.hoisted(() => ({
  markRead: vi.fn(),
  read: false,
  paginated: false,
  subscriptions: 0,
  unsubscriptions: 0,
}));
vi.mock("../src/payments/PaymentProvider", () => ({
  usePaymentsReady: () => true,
  paymentsConfigured: true,
}));
vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args: unknown) =>
    args === "skip" ? undefined : { count: mock.read ? 0 : 1, more: false },
  useMutation: () => mock.markRead,
  usePaginatedQuery: (_ref: unknown, args: { session: string } | "skip") => {
    const [pages, setPages] = useState(1);
    const token = args === "skip" ? null : args.session;
    useEffect(() => {
      if (!token) return;
      mock.subscriptions++;
      return () => {
        mock.unsubscriptions++;
      };
    }, [token]);
    return {
      results: !token
        ? []
        : Array.from({ length: pages }, (_, page) => ({
            _id: `notification${page || ""}`,
            _creationTime: Date.now(),
            wallet: token,
            linkId: "receipt-id",
            kind: "refund_requested",
            title: page ? `Older order for ${token}` : `Order for ${token}`,
            expiresAt: Date.now() + 1000,
            ...(mock.read ? { readAt: Date.now() } : {}),
          })),
      status: mock.paginated ? "CanLoadMore" : "Exhausted",
      loadMore: () => setPages((value) => value + 1),
    };
  },
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
  mock.paginated = false;
  mock.subscriptions = mock.unsubscriptions = 0;
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

it("closes the inbox on browser history navigation while the workspace stays mounted", async () => {
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-a") }),
    ),
  );
  await open();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("preloads once and preserves older pages when the dropdown closes and reopens", async () => {
  mock.paginated = true;
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-a") }),
    ),
  );
  expect(mock.subscriptions).toBe(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await open();
  await act(async () => button("Load older updates").click());
  expect(document.body.textContent).toContain("Older order for wallet-a");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close notifications"]')!
      .click(),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mock.unsubscriptions).toBe(0);
  await open();
  expect(mock.subscriptions).toBe(1);
  expect(document.body.textContent).toContain("Older order for wallet-a");
  expect(document.body.textContent).not.toContain("Loading your notifications");
});

it("drops the previous subscription and cached pages when the signed-in wallet changes", async () => {
  mock.paginated = true;
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-a") }),
    ),
  );
  await open();
  await act(async () => button("Load older updates").click());
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session("wallet-b") }),
    ),
  );
  expect(mock.unsubscriptions).toBe(1);
  expect(mock.subscriptions).toBe(2);
  expect(document.body.textContent).not.toContain("wallet-a");
  expect(document.body.textContent).not.toContain("Older order");
  expect(document.body.textContent).toContain("Order for wallet-b");
  await act(async () =>
    root.render(
      createElement(WorkspaceInbox, { active, session: session(null) }),
    ),
  );
  expect(mock.unsubscriptions).toBe(2);
  expect(document.body.textContent).not.toContain("Order for wallet-b");
});
