export const walletSessionKey = "reservepay.wallet.v1";
export type WalletSession = { name: string; address: string };

export function readWalletSession(): WalletSession | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(walletSessionKey) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "name" in value &&
      "address" in value &&
      typeof value.name === "string" &&
      typeof value.address === "string" &&
      value.name.length > 0 &&
      value.address.length > 0
    )
      return { name: value.name, address: value.address };
  } catch {}
  return null;
}

export function rememberWallet(session: WalletSession | null) {
  try {
    if (session)
      localStorage.setItem(walletSessionKey, JSON.stringify(session));
    else localStorage.removeItem(walletSessionKey);
  } catch {}
}
