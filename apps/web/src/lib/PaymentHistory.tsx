import { Button } from "@/components/ui/button";
import { ArrowUpRight, CheckCheck, Clock3, RotateCcw } from "lucide-react";
import { formatUsdc } from "@reservepay/core/settlement";
import { useDemoStore, type DemoOrder } from "./demo-store";

const labels = {
  paid: "Protected",
  completed: "Completed",
  refunded: "Refunded",
};
const icons = { paid: Clock3, completed: CheckCheck, refunded: RotateCcw };

export function PaymentHistory({
  onSelect,
  disabled,
}: {
  onSelect: (order: DemoOrder) => void;
  disabled: boolean;
}) {
  const { orders, loading, mode, connected } = useDemoStore();
  return (
    <div
      className={"payment-history mt-7 border border-line bg-white/50"}
      aria-label="Demo payment history"
    >
      <div
        className={
          "flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"
        }
      >
        <h3
          className={
            "font-mono text-[10px] tracking-wider text-muted-foreground"
          }
        >
          YOUR DEMO PAYMENTS
        </h3>
        <span
          role="status"
          className={
            "flex items-center gap-2 text-[10px] text-muted-foreground"
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green" : "bg-amber-600"}`}
          />
          {mode === "local"
            ? "This visit only"
            : connected
              ? "History synced"
              : "Connecting to saved history…"}
        </span>
      </div>
      {loading ? (
        <p className={"px-5 py-6 text-xs text-muted-foreground"} role="status">
          Loading your demo payments…
        </p>
      ) : orders.length === 0 ? (
        <p className={"px-5 py-6 text-xs text-muted-foreground"}>
          Your simulated payments will appear here.
          {mode === "synced" &&
            " Come back to this browser to pick up where you left off."}
        </p>
      ) : (
        <ul className={"m-0 list-none divide-y divide-line p-0"}>
          {orders.slice(0, 5).map((order) => {
            const Icon = icons[order.status];
            return (
              <li
                key={order.id}
                className={
                  "history-entry [&_button>svg]:[transition:transform_280ms_var(--ease-settle)] animate-[feedback-in_300ms_var(--ease-settle)_both] [@media((hover:_hover)_and_(pointer:_fine))]:[&_button:not(:disabled):hover>svg:last-child]:[transform:translateX(3px)] motion-reduce:[&_button>svg]:[transform:none]!"
                }
              >
                <Button
                  variant="unstyled"
                  size="unstyled"
                  className={
                    "flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-green/5 disabled:opacity-50"
                  }
                  disabled={disabled}
                  onClick={() => onSelect(order)}
                  aria-label={`View ${labels[order.status].toLowerCase()} demo payment of $${formatUsdc(order.amount)}`}
                >
                  <span
                    className={
                      "grid size-8 shrink-0 place-items-center border border-line bg-paper text-green"
                    }
                  >
                    <Icon
                      size={14}
                      key={order.status}
                      className={
                        "history-status-icon animate-[confirm-in_350ms_var(--ease-settle)_both]"
                      }
                    />
                  </span>
                  <span className={"flex-1"}>
                    <strong className={"block text-sm font-medium"}>
                      ${formatUsdc(order.amount)}{" "}
                      <span
                        className={"font-mono text-[9px] text-muted-foreground"}
                      >
                        USDC
                      </span>
                    </strong>
                    <time
                      dateTime={new Date(order.createdAt).toISOString()}
                      className={"text-[10px] text-muted-foreground"}
                    >
                      {new Date(order.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </span>
                  <span className={"text-[10px] text-green"}>
                    {labels[order.status]}
                  </span>
                  <ArrowUpRight size={13} className={"text-muted-foreground"} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p
        className={
          "border-t border-line px-5 py-3 text-[10px] text-muted-foreground"
        }
      >
        Demo records only. These are not on-chain transactions.
      </p>
    </div>
  );
}
