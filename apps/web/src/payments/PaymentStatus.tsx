import { Badge } from "@/components/ui/badge";
export function PaymentStatus({
  receipt,
  now = Date.now(),
}: {
  receipt?: { status: "paid" | "completed" | "refunded"; expiresAt: number };
  now?: number;
}) {
  const protectedPayment =
    receipt?.status === "paid" && receipt.expiresAt > now;
  const pending = !receipt || receipt.status === "paid";
  return (
    <Badge
      variant="outline"
      className={`link-payment-status rounded-[3px] border-0 px-[7px] py-[5px] font-mono text-[9px] font-normal ${protectedPayment ? "bg-[#e6efdd] text-[#365b28]" : pending ? "bg-[#f8f0df] text-[#805e2e]" : "bg-secondary text-muted-foreground"}`}
    >
      {receipt?.status === "paid"
        ? protectedPayment
          ? "Paid · protected"
          : "Paid · period ended"
        : (receipt?.status ?? "Awaiting payment")}
    </Badge>
  );
}
