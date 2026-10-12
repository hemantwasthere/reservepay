import { Badge } from "@/components/ui/badge";
export function PaymentStatus({
  receipt,
  now = Date.now(),
}: {
  receipt?: {
    status: "paid" | "completed" | "refunded";
    expiresAt: number;
    disputed?: boolean;
  };
  now?: number;
}) {
  // A disputed order is held for the resolver even after its deadline, so the
  // badge shows the dispute rather than the protection window.
  const disputed = receipt?.status === "paid" && receipt.disputed === true;
  const protectedPayment =
    receipt?.status === "paid" && !disputed && receipt.expiresAt > now;
  const pending = !receipt || receipt.status === "paid";
  return (
    <Badge
      variant="outline"
      className={`link-payment-status rounded-[3px] border-0 px-[7px] py-[5px] font-mono text-[9px] font-normal ${protectedPayment ? "bg-[light-dark(#e6efdd,var(--secondary))] text-[light-dark(#365b28,var(--primary))]" : pending ? "bg-[light-dark(#f8f0df,var(--warning-soft))] text-[light-dark(#805e2e,var(--warning))]" : "bg-secondary text-muted-foreground"}`}
    >
      {receipt?.status === "paid"
        ? disputed
          ? "Paid · disputed"
          : protectedPayment
            ? "Paid · protected"
            : "Paid · period ended"
        : (receipt?.status ?? "Awaiting payment")}
    </Badge>
  );
}
