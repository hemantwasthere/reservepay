export const refundReasons = {
  not_received: "Item or service not received",
  not_as_described: "Item or service not as described",
  cancellation: "Cancellation requested",
} as const;
export type RefundReason = keyof typeof refundReasons;
export type RefundApproval = {
  id: string;
  order: string;
  buyer: string;
  reason: RefundReason;
  issuedAt: number;
};
export function refundApproval(request: RefundApproval) {
  if (
    !Object.hasOwn(refundReasons, request.reason) ||
    !/^[a-zA-Z0-9]+$/.test(request.id) ||
    request.id.length > 64 ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(request.order) ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(request.buyer) ||
    !Number.isSafeInteger(request.issuedAt) ||
    request.issuedAt <= 0
  )
    throw new Error("Invalid refund request.");
  return new TextEncoder().encode(
    [
      "ReservePay refund request v1",
      "Network: Solana devnet (test tokens only)",
      "Program: ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU",
      `Payment link: ${request.id}`,
      `Order: ${request.order}`,
      `Buyer: ${request.buyer}`,
      `Reason: ${request.reason}`,
      `Issued at (milliseconds): ${request.issuedAt}`,
      "Request a full refund. The reason is public. This signature does not transfer funds or extend protection. A resolver must approve the refund on-chain.",
    ].join("\n"),
  );
}
