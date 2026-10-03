// The on-chain OrderStatus::Open variant means the buyer has paid and the
// protection period is running, so it maps to "paid" for merchants and buyers.
export type ChainOrderStatus = {
  open?: unknown;
  completed?: unknown;
  refunded?: unknown;
};
export type OrderStatus = "paid" | "completed" | "refunded";
export function orderStatus(status: ChainOrderStatus): OrderStatus {
  return "open" in status
    ? "paid"
    : "completed" in status
      ? "completed"
      : "refunded";
}
