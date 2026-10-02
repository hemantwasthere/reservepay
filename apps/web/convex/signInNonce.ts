// Stateless sign-in challenges. A nonce is random bytes plus an HMAC over the
// wallet and timing, so issuing one writes nothing to the database. Anonymous
// callers therefore cannot grow a table or exhaust a shared rate limit; rows
// are only written after a wallet signature verifies (see auth.createSession).
export const NONCE_TTL = 5 * 60_000;
const CLOCK_SKEW = 30_000;

const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

export function signInSecret(): string {
  const secret = process.env.SIGN_IN_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Sign-in is not configured for this deployment.");
  return secret;
}

const key = (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const payload = (
  wallet: string,
  random: string,
  issuedAt: number,
  expiresAt: number,
) =>
  encoder.encode(
    ["reservepay-sign-in-v1", wallet, random, issuedAt, expiresAt].join("\n"),
  );

export async function issueNonce(
  secret: string,
  wallet: string,
  issuedAt = Date.now(),
) {
  const expiresAt = issuedAt + NONCE_TTL;
  const random = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await key(secret),
      payload(wallet, random, issuedAt, expiresAt),
    ),
  );
  return { nonce: random + toHex(mac), issuedAt, expiresAt };
}

// Throws unless this server issued the nonce for exactly this wallet and
// timing, and it has not expired. Single use is enforced separately.
export async function verifyNonce(
  secret: string,
  challenge: { wallet: string; nonce: string; issuedAt: number; expiresAt: number },
  now = Date.now(),
) {
  const { wallet, nonce, issuedAt, expiresAt } = challenge;
  const valid =
    /^[a-f0-9]{96}$/.test(nonce) &&
    (await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromHex(nonce.slice(32)),
      payload(wallet, nonce.slice(0, 32), issuedAt, expiresAt),
    ));
  if (
    !valid ||
    expiresAt - issuedAt !== NONCE_TTL ||
    issuedAt > now + CLOCK_SKEW ||
    expiresAt <= now
  )
    throw new Error("This sign-in link expired. Try again.");
}
