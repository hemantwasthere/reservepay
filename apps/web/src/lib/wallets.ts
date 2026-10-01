import type { SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import { Transaction } from "@solana/web3.js";
import type { Wallet } from "@wallet-standard/base";
import type {
  StandardConnectFeature,
  StandardDisconnectFeature,
  StandardEventsFeature,
} from "@wallet-standard/features";

export type ConnectedAccount = { address: string; label?: string };
export type WalletOption = {
  identity: object;
  name: string;
  accounts(): ConnectedAccount[];
  connect(): Promise<ConnectedAccount[]>;
  disconnect(): Promise<void>;
  signTransaction?: (
    address: string,
    transaction: Uint8Array,
  ) => Promise<Uint8Array>;
  subscribe(listener: (accounts: ConnectedAccount[]) => void): () => void;
};

type SolanaWallet = Wallet & {
  features: StandardConnectFeature &
    StandardDisconnectFeature &
    StandardEventsFeature;
};

export function standardWallet(wallet: Wallet): WalletOption | null {
  if (
    !wallet.chains.some((chain) => chain.startsWith("solana:")) ||
    !wallet.features["standard:connect"] ||
    !wallet.features["standard:disconnect"] ||
    !wallet.features["standard:events"]
  )
    return null;
  const provider = wallet as SolanaWallet;
  const accounts = (items: Wallet["accounts"]) =>
    items
      .filter((account) =>
        account.chains.some((chain) => chain.startsWith("solana:")),
      )
      .map(({ address, label }) => ({ address, label }));
  const signing = wallet.features["solana:signTransaction"] as
    | SolanaSignTransactionFeature["solana:signTransaction"]
    | undefined;
  return {
    signTransaction: signing?.supportedTransactionVersions.includes("legacy")
      ? async (address, transaction) => {
          const account = wallet.accounts.find(
            (item) => item.address === address,
          );
          if (
            !account ||
            !account.chains.includes("solana:devnet") ||
            !account.features.includes("solana:signTransaction")
          )
            throw new Error(
              "Select Solana devnet in your wallet, then reconnect.",
            );
          const [result] = await signing.signTransaction({
            account,
            transaction,
            chain: "solana:devnet",
          });
          if (!result)
            throw new Error("Your wallet did not return a signed transaction.");
          return result.signedTransaction;
        }
      : undefined,
    identity: wallet,
    name: wallet.name,
    accounts: () => accounts(wallet.accounts),
    connect: async () =>
      accounts(
        (await provider.features["standard:connect"].connect()).accounts,
      ),
    disconnect: () => provider.features["standard:disconnect"].disconnect(),
    subscribe: (listener) =>
      provider.features["standard:events"].on("change", (event) => {
        if (event.accounts) listener(accounts(event.accounts));
      }),
  };
}

type PublicKey = { toString(): string };
type PhantomListener = (key?: PublicKey | null) => void;
type PhantomProvider = {
  isPhantom?: boolean;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  publicKey?: PublicKey | null;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  on(event: string, listener: PhantomListener): void;
  removeListener(event: string, listener: PhantomListener): void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

export function legacyPhantom(): WalletOption | null {
  const provider = window.phantom?.solana ?? window.solana;
  if (!provider?.isPhantom) return null;
  const accounts = (key?: PublicKey | null) =>
    key ? [{ address: key.toString() }] : [];
  return {
    signTransaction: provider.signTransaction
      ? async (address, bytes) => {
          if (provider.publicKey?.toString() !== address)
            throw new Error("Wallet account changed. Reconnect and try again.");
          const signed = await provider.signTransaction!(
            Transaction.from(bytes),
          );
          return new Uint8Array(signed.serialize());
        }
      : undefined,
    identity: provider,
    name: "Phantom",
    accounts: () => accounts(provider.publicKey),
    connect: async () => accounts((await provider.connect()).publicKey),
    disconnect: () => provider.disconnect(),
    subscribe: (listener) => {
      const change: PhantomListener = (key) => listener(accounts(key));
      const disconnect = () => listener([]);
      provider.on("accountChanged", change);
      provider.on("disconnect", disconnect);
      return () => {
        provider.removeListener("accountChanged", change);
        provider.removeListener("disconnect", disconnect);
      };
    },
  };
}
