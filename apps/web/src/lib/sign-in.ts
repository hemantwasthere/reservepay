// This exact, versioned message is signed by the merchant's wallet to sign in.
export type SignInChallenge = {
  wallet: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  domain: string;
};
export function validateWallet(address: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
    throw new Error("Invalid wallet address.");
}
export function validateChallenge(challenge: SignInChallenge) {
  validateWallet(challenge.wallet);
  if (!/^[a-f0-9]{96}$/.test(challenge.nonce)) throw new Error("Invalid nonce.");
  if (
    !Number.isSafeInteger(challenge.issuedAt) ||
    !Number.isSafeInteger(challenge.expiresAt) ||
    challenge.issuedAt <= 0 ||
    challenge.expiresAt <= challenge.issuedAt
  )
    throw new Error("Invalid sign-in challenge timing.");
  if (
    !challenge.domain ||
    challenge.domain.length > 100 ||
    /[\x00-\x20\x7f]/.test(challenge.domain)
  )
    throw new Error("Invalid sign-in domain.");
}
export function signInMessage(challenge: SignInChallenge): Uint8Array {
  validateChallenge(challenge);
  return new TextEncoder().encode(
    [
      "ReservePay sign-in v1",
      "Network: Solana devnet (test tokens only)",
      `Domain: ${challenge.domain}`,
      `Wallet: ${challenge.wallet}`,
      `Nonce: ${challenge.nonce}`,
      `Issued at (milliseconds): ${challenge.issuedAt}`,
      `Expires at (milliseconds): ${challenge.expiresAt}`,
      "Sign in to your merchant workspace. This signature does not transfer funds.",
    ].join("\n"),
  );
}

// Checks the domain in a signed sign-in message. Only runs server-side.
export const allowedDomain = (domain: string): boolean => {
  const configured = process.env.SITE_ORIGIN?.replace(/^https?:\/\//, "");
  if (configured) return domain === configured;
  if (domain === "reservepayyy.vercel.app") return true;
  // Local development servers.
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(domain);
};
