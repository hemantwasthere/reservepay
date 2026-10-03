// This exact, versioned message is approved by the merchant's wallet.
export type PaymentTerms = {
  merchant: string;
  reference: string;
  title: string;
  description?: string;
  amount: string;
  protectionSeconds: number;
  issuedAt: number;
};
export const MAX_PAYMENT = 10_000_000_000n;
export function validateTerms(terms: PaymentTerms) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(terms.merchant))
    throw new Error("Invalid merchant wallet.");
  if (!/^[a-f0-9]{32}$/.test(terms.reference))
    throw new Error("Invalid payment reference.");
  if (
    !terms.title.trim() ||
    terms.title !== terms.title.trim() ||
    terms.title.length > 100 ||
    /[\x00-\x1f\x7f]/.test(terms.title)
  )
    throw new Error("Enter a title of 1–100 characters without line breaks.");
  if (
    terms.description !== undefined &&
    (!terms.description.trim() ||
      terms.description !== terms.description.trim() ||
      terms.description.length > 500 ||
      /[\x00-\x09\x0b-\x1f\x7f]/.test(terms.description))
  )
    throw new Error("Enter a description of 1–500 characters.");
  if (
    !/^[1-9]\d{0,10}$/.test(terms.amount) ||
    BigInt(terms.amount) > MAX_PAYMENT
  )
    throw new Error("Enter an amount up to 10,000 USDC.");
  if (![3600, 86400, 604800].includes(terms.protectionSeconds))
    throw new Error("Choose 1 hour, 1 day, or 7 days of protection.");
  if (!Number.isSafeInteger(terms.issuedAt) || terms.issuedAt <= 0)
    throw new Error("Invalid approval time.");
}
export function paymentApproval(terms: PaymentTerms): Uint8Array {
  validateTerms(terms);
  // Links without a description keep the exact v1 message so existing
  // approvals and old clients keep verifying.
  if (terms.description === undefined)
    return new TextEncoder().encode(
      [
        "ReservePay payment link approval v1",
        "Network: Solana devnet (test tokens only)",
        `Merchant: ${terms.merchant}`,
        `Reference: ${terms.reference}`,
        `Title: ${terms.title}`,
        `Amount (USDC base units): ${terms.amount}`,
        `Protection (seconds): ${terms.protectionSeconds}`,
        `Issued at (milliseconds): ${terms.issuedAt}`,
        "Create this single-use payment link. This signature does not transfer funds.",
      ].join("\n"),
    );
  return new TextEncoder().encode(
    [
      "ReservePay payment link approval v2",
      "Network: Solana devnet (test tokens only)",
      `Merchant: ${terms.merchant}`,
      `Reference: ${terms.reference}`,
      `Title: ${terms.title}`,
      `Description: ${JSON.stringify(terms.description)}`,
      `Amount (USDC base units): ${terms.amount}`,
      `Protection (seconds): ${terms.protectionSeconds}`,
      `Issued at (milliseconds): ${terms.issuedAt}`,
      "Create this single-use payment link. This signature does not transfer funds.",
    ].join("\n"),
  );
}
export function referenceBytes(reference: string) {
  if (!/^[a-f0-9]{32}$/.test(reference))
    throw new Error("Invalid payment reference.");
  return Uint8Array.from(reference.match(/../g)!, (byte) => parseInt(byte, 16));
}
export const protectionLabel = (seconds: number) =>
  seconds === 3600 ? "1 hour" : seconds === 86400 ? "1 day" : "7 days";
