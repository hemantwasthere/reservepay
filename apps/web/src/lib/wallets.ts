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
  return {
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
