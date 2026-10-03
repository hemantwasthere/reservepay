import bs58 from "bs58";
export type PendingPayment = {
  signature: string;
  lastValidBlockHeight: number;
  buyer: string;
};
export const paymentKey = (id: string) => `reservepay:devnet:checkout:${id}`;
export function loadPayment(id: string): PendingPayment | null {
  const raw = localStorage.getItem(paymentKey(id));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingPayment;
  if (
    typeof value.signature !== "string" ||
    bs58.decode(value.signature).length !== 64 ||
    !Number.isSafeInteger(value.lastValidBlockHeight) ||
    value.lastValidBlockHeight <= 0 ||
    typeof value.buyer !== "string" ||
    bs58.decode(value.buyer).length !== 32
  )
    throw new Error(
      "Saved payment could not be read. Check your wallet activity before retrying.",
    );
  return value;
}
export function savePayment(id: string, payment: PendingPayment) {
  localStorage.setItem(paymentKey(id), JSON.stringify(payment));
}
export function clearPayment(id: string) {
  localStorage.removeItem(paymentKey(id));
}
