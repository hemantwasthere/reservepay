export const merchantSessionKey = (address: string) =>
  `reservepay.session.v1:${address}`;
export type MerchantSession = { token: string; expiresAt: number };

export function readSession(address: string): MerchantSession | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(merchantSessionKey(address)) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "token" in value &&
      "expiresAt" in value &&
      typeof value.token === "string" &&
      /^[a-f0-9]{64}$/.test(value.token) &&
      typeof value.expiresAt === "number" &&
      value.expiresAt > Date.now()
    )
      return { token: value.token, expiresAt: value.expiresAt };
  } catch {}
  return null;
}

export function rememberSession(
  address: string,
  session: MerchantSession | null,
) {
  try {
    if (session)
      localStorage.setItem(
        merchantSessionKey(address),
        JSON.stringify(session),
      );
    else localStorage.removeItem(merchantSessionKey(address));
  } catch {}
}

export function clearSession(address: string) {
  rememberSession(address, null);
}
