// The on-chain OrderStatus::Open variant means the buyer has paid and the
// protection period is running, so it maps to "paid" for merchants and buyers.
// Disputed also maps to "paid" (the funds are still locked); use isDisputed
// to tell it apart. Anything unrecognized must throw: a silent fallthrough
// once turned an unknown variant into "refunded" and wiped dispute state.
export type ChainOrderStatus = {
  open?: unknown;
  completed?: unknown;
  refunded?: unknown;
  disputed?: unknown;
};
export type OrderStatus = "paid" | "completed" | "refunded";
export function orderStatus(status: ChainOrderStatus): OrderStatus {
  if ("open" in status || "disputed" in status) return "paid";
  if ("completed" in status) return "completed";
  if ("refunded" in status) return "refunded";
  throw new Error("Unknown order status");
}
export function isDisputed(status: ChainOrderStatus): boolean {
  return "disputed" in status;
}
