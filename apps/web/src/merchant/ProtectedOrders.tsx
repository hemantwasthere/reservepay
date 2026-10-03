import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { exactAmount, explorer, type MerchantOrder } from "./client";

const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;

const remaining = (order: MerchantOrder, now: number) => {
  if (order.status !== "paid")
    return order.status === "completed" ? "Completed" : "Refunded";
  const ms = order.expiresAt - now;
  if (ms <= 0) return "Period ended · ready to release";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Protected · <1m left";
  if (minutes < 60) return `Protected · ${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Protected · ${hours}h left`;
  return `Protected · ${Math.floor(hours / 24)}d left`;
};

const tabs = [
  { key: "paid", label: "Protected" },
  { key: "completed", label: "Completed" },
  { key: "refunded", label: "Refunded" },
] as const;

export function ProtectedOrders({
  orders,
  mismatch,
  loading,
  titles,
}: {
  orders: MerchantOrder[] | null;
  mismatch: boolean;
  loading: boolean;
  titles: Record<string, string>;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("paid");
  const now = Date.now();
  const shown = (orders ?? []).filter((order) => order.status === tab);
  return (
    <Card
      as="section"
      className={
        "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:text-[18px] [&_h2]:tracking-[-0.4px] [&_h2]:leading-[1.5] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] protected-orders mb-[20px]"
      }
      aria-labelledby="protected-orders-title"
      aria-busy={loading && !orders}
    >
      <CardHeader
        className={
          "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[light-dark(#91a481,var(--primary))]"
        }
      >
        <div>
          <span
            className={
              "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
            }
          >
            ORDERS / ON-CHAIN
          </span>
          <h2 id="protected-orders-title">Protected orders</h2>
        </div>
        <ShieldAlert size={22} aria-hidden="true" />
      </CardHeader>
      {mismatch && (
        <div
          className={
            "merchant-alert [border:1px_solid_light-dark(#e6d9b6,var(--border))] bg-[light-dark(#f9f5e8,var(--warning-soft))] text-[light-dark(#78623b,var(--warning))] text-[12px] leading-[1.7] py-[15px] px-[18px] rounded-[3px] mb-[20px] [overflow-wrap:anywhere]"
          }
          role="alert"
        >
          The open orders below do not add up to the locked reserve shown above.
          Refresh in a moment; recent payments may still be confirming.
        </div>
      )}
      <div
        className={
          'transfer-tabs flex bg-[light-dark(#f0f2eb,var(--secondary))] p-[4px] rounded-[4px] my-[21px] mx-0 gap-[4px] [&_button]:flex-[1] [&_button]:[border:1px_solid_transparent] [&_button]:bg-transparent [&_button]:text-[11px] [&_button]:p-[8px] [&_button]:rounded-[3px] [&_button]:text-muted-foreground [&_button]:[transition:background_0.2s,_box-shadow_0.2s] [&_button[aria-pressed="true"]]:bg-card [&_button[aria-pressed="true"]]:border-[light-dark(#dce2d3,var(--border))] [&_button[aria-pressed="true"]]:shadow-[0_1px_3px_#24282008] [&_button[aria-pressed="true"]]:text-foreground max-w-[340px]'
        }
        role="group"
        aria-label="Order status"
      >
        {tabs.map((item) => (
          <Button
            variant="unstyled"
            size="unstyled"
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {!orders ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
          role="status"
        >
          {loading ? (
            "Loading orders…"
          ) : (
            <>
              <strong>Orders could not be loaded.</strong>
              <span>
                Showing no orders is safer than showing stale ones. The list
                retries with the next balance refresh.
              </span>
            </>
          )}
        </div>
      ) : shown.length === 0 ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500] [&_a]:text-primary"
          }
        >
          {tab === "paid" ? (
            <>
              <strong>No protected orders yet.</strong>
              <span>
                <a href="/app/payments">Create a payment link</a> to get
                started.
              </span>
            </>
          ) : (
            <span>
              No {tab === "completed" ? "completed" : "refunded"} orders.
            </span>
          )}
        </div>
      ) : (
        <ul
          className={
            "protected-order-list [list-style:none] p-0 [margin:10px_0_0] [&_li]:[border-bottom:1px_solid_var(--line)] [&_li:last-child]:[border-bottom:0]"
          }
        >
          {shown.map((order) => (
            <li key={order.address} className={"py-[16px]"}>
              <div
                className={
                  "grid grid-cols-[minmax(0,_1.4fr)_minmax(0,_0.8fr)_minmax(0,_0.8fr)_minmax(0,_0.9fr)_minmax(0,_1.1fr)_auto] gap-[14px] items-center text-[12px] max-[640px]:grid-cols-[1fr_auto] max-[640px]:gap-[6px_12px]"
                }
              >
                <div
                  className={
                    "min-w-[0] flex flex-col gap-[5px] [&>strong]:text-[13px] [&>strong]:font-[500] [&>strong]:[overflow-wrap:anywhere] [&>span]:text-muted-foreground [&>span]:text-[10px] [&>span]:[font:10px_var(--mono)]"
                  }
                >
                  <strong>
                    {titles[order.reference] ??
                      `Order · ${order.reference.slice(0, 8)}`}
                  </strong>
                  <span>Buyer {short(order.buyer)}</span>
                </div>
                <div className={"[font:12px_var(--mono)] whitespace-nowrap"}>
                  {exactAmount(order.amount)}{" "}
                  <span className={"text-muted-foreground text-[9px]"}>
                    USDC
                  </span>
                </div>
                <div
                  className={
                    "[font:12px_var(--mono)] whitespace-nowrap text-muted-foreground"
                  }
                  title="Reserve held"
                >
                  {exactAmount(order.reserveAmount)}{" "}
                  <span className={"text-[9px]"}>held</span>
                </div>
                <div
                  className={
                    "text-muted-foreground [font:10px_var(--mono)] whitespace-nowrap max-[640px]:hidden"
                  }
                >
                  {new Date(order.createdAt).toLocaleDateString()}
                </div>
                <div
                  className={`text-[11px] whitespace-nowrap ${order.status === "paid" && order.expiresAt <= now ? "text-[light-dark(#805e2e,var(--warning))]" : order.status === "paid" ? "text-[light-dark(#476238,var(--primary))]" : "text-muted-foreground"}`}
                >
                  {remaining(order, now)}
                </div>
                <a
                  className={
                    "inline-flex items-center gap-[5px] text-primary text-[11px] whitespace-nowrap"
                  }
                  href={explorer(order.address)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View order ${titles[order.reference] ?? order.reference.slice(0, 8)} on Solana Explorer`}
                >
                  Explorer <ArrowUpRight size={12} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
