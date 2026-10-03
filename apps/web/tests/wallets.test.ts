import { afterEach, describe, expect, it, vi } from "vitest";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { StandardEventsChangeProperties } from "@wallet-standard/features";
import { legacyPhantom, standardWallet, isWalletRejection } from "../src/lib/wallets";

const account = (address: string, chain = "solana:mainnet"): WalletAccount => ({
  address,
  publicKey: new Uint8Array(32),
  chains: [chain as `${string}:${string}`],
  features: [],
});

function fixture() {
  const solana = account("solana-account");
  const evm = account("evm-account", "eip155:1");
  let listener: ((event: StandardEventsChangeProperties) => void) | undefined;
  const off = vi.fn(() => {
    listener = undefined;
  });
  const connect = vi.fn(async () => ({ accounts: [evm, solana] }));
  const disconnect = vi.fn(async () => {
    listener?.({ accounts: [] });
  });
  const wallet: Wallet = {
    version: "1.0.0",
    name: "Test wallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:mainnet", "eip155:1"],
    accounts: [evm, solana],
    features: {
      "standard:connect": { version: "1.0.0", connect },
      "standard:disconnect": { version: "1.0.0", disconnect },
      "standard:events": {
        version: "1.0.0",
        on: (_: string, callback: typeof listener) => {
          listener = callback;
          return off;
        },
      },
    },
  };
  return {
    wallet,
    connect,
    disconnect,
    off,
    change: (accounts: WalletAccount[]) => listener?.({ accounts }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("wallet rejection detection", () => {
  it("recognizes the rejection shapes real wallets throw", () => {
    expect(
      isWalletRejection({ code: 4001, message: "User rejected the request." }),
    ).toBe(true);
    expect(isWalletRejection(new Error("Transaction cancelled"))).toBe(true);
    expect(
      isWalletRejection({
        name: "WalletSignTransactionError",
        message: "User rejected",
      }),
    ).toBe(true);
    expect(
      isWalletRejection({
        name: "WalletSignMessageError",
        message: "Signing failed",
      }),
    ).toBe(true);
    expect(isWalletRejection(new Error("Approval Denied"))).toBe(true);
    expect(isWalletRejection(new Error("User declined to sign"))).toBe(true);
  });

  it("leaves genuine errors untouched", () => {
    expect(isWalletRejection(new Error("Insufficient funds"))).toBe(false);
    expect(isWalletRejection("Wallet changed. Nothing was submitted.")).toBe(
      false,
    );
    expect(isWalletRejection(new Error("fetch failed"))).toBe(false);
    expect(isWalletRejection(new Error("Blockhash not found"))).toBe(false);
    expect(isWalletRejection(null)).toBe(false);
    expect(isWalletRejection(undefined)).toBe(false);
  });
});

describe("wallet connections", () => {
  it("requests only previously authorized accounts on reconnect", async () => {
    const { wallet, connect } = fixture();
    const option = standardWallet(wallet)!;
    expect(await option.reconnect()).toEqual([
      { address: "solana-account", label: undefined },
    ]);
    expect(connect).toHaveBeenCalledWith({ silent: true });
    connect.mockRejectedValueOnce(new Error("Wallet locked"));
    await expect(option.reconnect()).rejects.toThrow("Wallet locked");
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith({ silent: true });
  });
  it("only exposes Solana accounts from a multichain wallet", async () => {
    const { wallet } = fixture();
    const option = standardWallet(wallet)!;
    expect(await option.connect()).toEqual([
      { address: "solana-account", label: undefined },
    ]);
    expect(option.accounts()).toEqual(await option.connect());
  });

  it("ignores wallets without Solana or required connection features", () => {
    const { wallet } = fixture();
    expect(standardWallet({ ...wallet, chains: ["eip155:1"] })).toBeNull();
    expect(standardWallet({ ...wallet, features: {} })).toBeNull();
  });

  it("reports account switches and external disconnects and removes listeners", async () => {
    const { wallet, change, off } = fixture();
    const option = standardWallet(wallet)!;
    const updates = vi.fn();
    const unsubscribe = option.subscribe(updates);
    change([account("new-account")]);
    expect(updates).toHaveBeenLastCalledWith([
      { address: "new-account", label: undefined },
    ]);
    await option.disconnect();
    expect(updates).toHaveBeenLastCalledWith([]);
    unsubscribe();
    expect(off).toHaveBeenCalledOnce();
    change([account("ignored")]);
    expect(updates).toHaveBeenCalledTimes(2);
  });

  it("preserves rejected connection and disconnect errors for the UI", async () => {
    const { wallet, connect, disconnect } = fixture();
    const option = standardWallet(wallet)!;
    connect.mockRejectedValueOnce(new Error("Rejected"));
    disconnect.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(option.connect()).rejects.toThrow("Rejected");
    await expect(option.disconnect()).rejects.toThrow("Unavailable");
  });

  it("uses Phantom's own provider and tracks legacy account events", async () => {
    const listeners = new Map<
      string,
      (key?: { toString(): string } | null) => void
    >();
    const key = { toString: () => "phantom-account" };
    const provider = {
      isPhantom: true,
      publicKey: key,
      connect: vi.fn(async () => ({ publicKey: key })),
      disconnect: vi.fn(async () => {}),
      on: (
        event: string,
        listener: typeof listeners extends Map<string, infer T> ? T : never,
      ) => listeners.set(event, listener),
      removeListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    };
    vi.stubGlobal("window", {
      phantom: { solana: provider },
      solana: { isPhantom: false },
    });
    const option = legacyPhantom()!;
    expect(await option.connect()).toEqual([{ address: "phantom-account" }]);
    expect(await option.reconnect()).toEqual([{ address: "phantom-account" }]);
    expect(provider.connect).toHaveBeenLastCalledWith({ onlyIfTrusted: true });
    const update = vi.fn();
    const unsubscribe = option.subscribe(update);
    listeners.get("accountChanged")?.({ toString: () => "second-account" });
    expect(update).toHaveBeenLastCalledWith([{ address: "second-account" }]);
    listeners.get("accountChanged")?.(null);
    expect(update).toHaveBeenLastCalledWith([]);
    await option.disconnect();
    expect(provider.disconnect).toHaveBeenCalledOnce();
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});

describe("wallet transaction signing", () => {
  it("passes the selected account and explicit devnet chain to the wallet", async () => {
    const { wallet } = fixture();
    const shared = {
      ...account("selected", "solana:devnet"),
      features: ["solana:signTransaction" as const],
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const signTransaction = vi.fn(async () => [{ signedTransaction: bytes }]);
    const option = standardWallet({
      ...wallet,
      accounts: [shared],
      features: {
        ...wallet.features,
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy"],
          signTransaction,
        },
      },
    })!;
    expect(await option.signTransaction!("selected", bytes)).toEqual(bytes);
    expect(signTransaction).toHaveBeenCalledWith({
      account: shared,
      transaction: bytes,
      chain: "solana:devnet",
    });
    await expect(option.signTransaction!("old-account", bytes)).rejects.toThrow(
      "devnet",
    );
    expect(signTransaction).toHaveBeenCalledTimes(1);
  });
  it("does not request a signature from an account without devnet support", async () => {
    const { wallet } = fixture();
    const signTransaction = vi.fn();
    const option = standardWallet({
      ...wallet,
      features: {
        ...wallet.features,
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy"],
          signTransaction,
        },
      },
    })!;
    await expect(
      option.signTransaction!("solana-account", new Uint8Array()),
    ).rejects.toThrow("devnet");
    expect(signTransaction).not.toHaveBeenCalled();
  });
});

describe("payment link approval", () => {
  it("signs the exact message and refuses wallet-modified messages", async () => {
    const { wallet } = fixture();
    const selected = {
      ...account("selected", "solana:devnet"),
      features: ["solana:signMessage" as const],
    };
    const message = new Uint8Array([1, 2, 3]),
      signature = new Uint8Array(64);
    const signMessage = vi.fn(async () => [
      { signedMessage: message, signature },
    ]);
    const option = standardWallet({
      ...wallet,
      accounts: [selected],
      features: {
        ...wallet.features,
        "solana:signMessage": { version: "1.0.0", signMessage },
      },
    })!;
    expect(await option.signMessage!("selected", message)).toEqual(signature);
    expect(signMessage).toHaveBeenCalledWith({ account: selected, message });
    signMessage.mockResolvedValue([
      { signedMessage: new Uint8Array([4]), signature },
    ]);
    await expect(option.signMessage!("selected", message)).rejects.toThrow(
      "changed the approval",
    );
    await expect(option.signMessage!("another", message)).rejects.toThrow(
      "cannot approve",
    );
  });
});
