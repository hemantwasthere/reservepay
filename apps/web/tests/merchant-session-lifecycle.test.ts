// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import type { WalletConnection } from "../src/lib/WalletControl";
import { readSession } from "../src/lib/merchant-session";

const mocks = vi.hoisted(() => ({
  expiresAt: undefined as number | undefined,
  nonce: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useAction: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "authActions:requestNonce"
      ? mocks.nonce
      : mocks.signIn,
  useMutation: () => mocks.signOut,
  useQuery: (_ref: unknown, args: unknown) =>
    args === "skip"
      ? undefined
      : { wallet: "signed-in", expiresAt: mocks.expiresAt },
}));
vi.mock("../src/lib/Toast", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));
vi.mock("../src/payments/PaymentProvider", () => ({
  paymentsConfigured: true,
}));
import {
  MerchantSessionGate,
  type MerchantSession,
} from "../src/lib/useMerchantSession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const wallet = (address = "11111111111111111111111111111111") =>
  ({
    account: { address },
    wallet: { signMessage: vi.fn(async () => new Uint8Array(64)) },
  }) as unknown as WalletConnection;
const session = (char = "a") => ({
  token: char.repeat(64),
  expiresAt: Date.now() + 60_000,
});
let root: Root;
let container: HTMLDivElement;
let current: MerchantSession;
async function render(active: WalletConnection | null) {
  await act(async () =>
    root.render(
      createElement(MerchantSessionGate, {
        active,
        children: (value) => {
          current = value;
          return null;
        },
      }),
    ),
  );
}
async function begin() {
  let pending!: Promise<void>;
  await act(async () => {
    pending = current.signIn();
  });
  return { pending };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  vi.clearAllMocks();
  mocks.expiresAt = undefined;
  mocks.nonce.mockResolvedValue({
    nonce: "c".repeat(96),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
  });
  mocks.signOut.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("merchant session lifecycle", () => {
  it("expires a session on time even while the workspace stays mounted", async () => {
    vi.useFakeTimers();
    try {
      const active = wallet();
      mocks.expiresAt = Date.now() + 10_000;
      mocks.signIn.mockResolvedValueOnce({
        ...session(),
        expiresAt: mocks.expiresAt,
      });
      await render(active);
      await act(async () => {
        await current.signIn();
      });
      expect(current.status).toBe("signed-in");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_001);
      });
      expect(current.status).toBe("signed-out");
      expect(readSession(active.account.address)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("revokes a late login after disconnect and stays signed out on reconnect", async () => {
    const active = wallet(),
      late = deferred<ReturnType<typeof session>>();
    mocks.signIn.mockReturnValueOnce(late.promise);
    await render(active);
    const { pending } = await begin();
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    await act(async () => {
      await current.signOut();
    });
    await render(null);
    await act(async () => {
      late.resolve(session());
      await pending;
    });
    expect(readSession(active.account.address)).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledWith({ session: session().token });
    await render(active);
    expect(current.status).toBe("signed-out");
  });

  it("does not overwrite a newer login after sign-out and reconnect", async () => {
    const active = wallet(),
      late = deferred<ReturnType<typeof session>>();
    mocks.signIn
      .mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce(session("b"));
    await render(active);
    const { pending } = await begin();
    await act(async () => {
      await current.signOut();
    });
    await act(async () => {
      await current.signIn();
    });
    expect(current.token).toBe(session("b").token);
    await act(async () => {
      late.resolve(session());
      await pending;
    });
    expect(readSession(active.account.address)?.token).toBe(session("b").token);
    expect(current.token).toBe(session("b").token);
    expect(mocks.signOut).toHaveBeenCalledWith({ session: session().token });
  });

  it("cancels when the wallet switches away and back without explicit sign-out", async () => {
    const active = wallet(),
      late = deferred<ReturnType<typeof session>>();
    mocks.signIn.mockReturnValueOnce(late.promise);
    await render(active);
    const { pending } = await begin();
    await render(wallet("22222222222222222222222222222222"));
    await render(active);
    await act(async () => {
      late.resolve(session());
      await pending;
    });
    expect(readSession(active.account.address)).toBeNull();
    expect(current.status).toBe("signed-out");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not prompt the wallet after a canceled nonce request", async () => {
    const active = wallet(),
      late = deferred<object>();
    mocks.nonce.mockReturnValueOnce(late.promise);
    await render(active);
    const { pending } = await begin();
    await act(async () => {
      await current.signOut();
    });
    await act(async () => {
      late.resolve({});
      await pending;
    });
    expect(active.wallet.signMessage).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("does not send a signed challenge after disconnect during wallet approval", async () => {
    const active = wallet(),
      late = deferred<Uint8Array>();
    vi.mocked(active.wallet.signMessage!).mockReturnValueOnce(late.promise);
    await render(active);
    const { pending } = await begin();
    await render(null);
    await act(async () => {
      late.resolve(new Uint8Array(64));
      await pending;
    });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("revokes a session returned after unmount", async () => {
    const late = deferred<ReturnType<typeof session>>();
    mocks.signIn.mockReturnValueOnce(late.promise);
    await render(wallet());
    const { pending } = await begin();
    await act(async () => root.render(null));
    await act(async () => {
      late.resolve(session());
      await pending;
    });
    expect(localStorage.length).toBe(0);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("allows one concurrent login and clears the saved session on sign-out", async () => {
    const active = wallet();
    mocks.signIn.mockResolvedValueOnce(session());
    await render(active);
    await act(async () => {
      await Promise.all([current.signIn(), current.signIn()]);
    });
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(current.status).toBe("signed-in");
    expect(readSession(active.account.address)?.token).toBe(session().token);
    await act(async () => {
      await current.signOut();
    });
    expect(current.status).toBe("signed-out");
    expect(readSession(active.account.address)).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledWith({ session: session().token });
  });
});
