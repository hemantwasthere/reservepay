import { Component, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { usePaymentsReady } from "../payments/PaymentProvider";
import { Card } from "@/components/ui/card";
import {
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type Status = FunctionReturnType<typeof api.workers.status>[number];

export function describeWorker(worker: Status, now: number) {
  if (worker.startedAt === null) return "Waiting for first check";
  const keeper = worker.name === "keeper";
  const staleAfter = (keeper ? 15 : 6) * 60_000;
  const maxRun = (keeper ? 5 : 2) * 60_000;
  if (
    now - worker.startedAt > staleAfter ||
    (worker.finishedAt === null && now - worker.startedAt > maxRun)
  )
    return "Updates delayed";
  if (worker.finishedAt === null) return "Checking";
  switch (worker.issue) {
    case "unconfigured":
      return "Not enabled";
    case "low_funds":
      return "Fee wallet needs funding";
    case "failed":
      return "Retrying after a problem";
    case "incomplete":
      return "Some updates need attention";
    default:
      return "Running normally";
  }
}

const services = [
  {
    name: "reconcile",
    title: "Payment updates",
    description: "Keeps your receipts up to date.",
    cadence: "Every 2 min",
    icon: RefreshCw,
    help: "Open a receipt and refresh to check the latest payment status.",
  },
  {
    name: "keeper",
    title: "Reserve releases",
    description: "Releases reserves after protection ends.",
    cadence: "Every 5 min",
    icon: ShieldCheck,
    help: "Expired orders can still be completed manually. Pending refund requests need a resolver.",
  },
  {
    name: "notifications",
    title: "Inbox reminders",
    description: "Brings refund and deadline updates here.",
    cadence: "Every 2 min",
    icon: Bell,
    help: "Check your receipt for the protection deadline. Reminders may arrive late.",
  },
] as const;

function serviceTone(worker: Status | undefined, now: number) {
  if (!worker || worker.startedAt === null) return "waiting";
  const label = describeWorker(worker, now);
  return label === "Running normally"
    ? "healthy"
    : label === "Checking"
      ? "checking"
      : "attention";
}

export function ServiceStatusCard({
  workers,
  now,
  unavailable = false,
}: {
  workers?: Status[];
  now: number;
  unavailable?: boolean;
}) {
  const rows = services.map((service) => {
    const worker = workers?.find((row) => row.name === service.name);
    return { ...service, worker, tone: serviceTone(worker, now) };
  });
  const healthy = rows.every((row) => row.tone === "healthy");
  const attention = rows.some((row) => row.tone === "attention");
  const summary = unavailable
    ? "Service status unavailable"
    : healthy
      ? "All services running"
      : attention
        ? "Some services need attention"
        : "Checking background services";
  return (
    <Card
      className="mt-7 gap-0 overflow-hidden p-0 shadow-none"
      aria-label="Payment service status"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
        <div>
          <p className="mb-2 font-mono text-[9px] tracking-[1.3px] text-muted-foreground">
            WORKING IN THE BACKGROUND
          </p>
          <h2
            className="flex items-center gap-2 text-base font-medium leading-normal tracking-normal"
            aria-live="polite"
          >
            <span
              className={`relative flex size-2 shrink-0 ${unavailable || attention ? "text-amber-600 dark:text-amber-400" : healthy ? "text-primary" : "text-muted-foreground"}`}
              aria-hidden="true"
            >
              {healthy && (
                <span className="absolute inline-flex size-full rounded-full bg-current opacity-20 motion-safe:animate-pulse" />
              )}
              <span className="relative inline-flex size-2 rounded-full bg-current" />
            </span>
            {summary}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {unavailable
              ? "Your workspace is still available. Reload to reconnect."
              : "Keeping the little things moving, automatically."}
          </p>
        </div>
        <svg
          viewBox="0 0 112 52"
          className="hidden h-12 w-28 shrink-0 text-muted-foreground/40 sm:block"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M17 27c12-16 22 16 39 0s25-11 39 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />
          {rows.map((row, index) => (
            <g
              key={row.name}
              className={
                row.tone === "healthy"
                  ? "text-primary"
                  : row.tone === "attention"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }
            >
              <circle
                cx={17 + index * 39}
                cy="27"
                r="10"
                className="fill-card"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              {row.tone === "healthy" ? (
                <path
                  d={`m${13 + index * 39} 27 3 3 5-6`}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <circle
                  cx={17 + index * 39}
                  cy="27"
                  r="2"
                  fill="currentColor"
                />
              )}
            </g>
          ))}
          <path
            d="m96 7 2 3 4-1M4 42l4-2"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {!unavailable && (
        <div className="grid divide-y divide-border/70 md:grid-cols-3 md:divide-x md:divide-y-0">
          {rows.map(
            ({
              name,
              title,
              description,
              cadence,
              icon: Icon,
              worker,
              tone,
              help,
            }) => {
              const minutes =
                worker?.lastSuccessAt == null
                  ? null
                  : Math.max(
                      0,
                      Math.floor((now - worker.lastSuccessAt) / 60_000),
                    );
              const label = worker
                ? describeWorker(worker, now)
                : "Checking service status…";
              return (
                <div key={name} className="px-5 py-5 sm:px-6">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
                      <Icon
                        className={`size-4 ${tone === "checking" && name === "reconcile" ? "motion-safe:animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                    </span>
                    <h3 className="text-xs font-medium tracking-normal">
                      {title}
                    </h3>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                  <div className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
                    {tone === "healthy" ? (
                      <Check
                        className="mt-0.5 size-3 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    ) : tone === "attention" ? (
                      <CircleAlert
                        className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <Clock3
                        className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={
                        tone === "attention"
                          ? "text-amber-700 dark:text-amber-300"
                          : tone === "healthy"
                            ? "text-primary"
                            : "text-muted-foreground"
                      }
                    >
                      {label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {minutes === null
                      ? "No successful check yet"
                      : minutes === 0
                        ? "Checked just now"
                        : `Checked ${minutes} min ago`}
                    <span aria-hidden="true"> · </span>
                    {cadence}
                  </p>
                  {tone === "attention" && (
                    <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                      {help}
                    </p>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
      {!unavailable && (
        <details className="group border-t border-border/70 bg-muted/20 px-5 text-[11px] text-muted-foreground sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
            <span>What happens if an update is delayed?</span>
            <ChevronDown
              className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <p className="max-w-3xl pb-4 leading-relaxed">
            You can refresh any receipt for its latest status, or complete an
            expired order manually. Refund requests need a resolver’s decision.
            Inbox reminders may arrive late, so always check the protection
            deadline on your receipt.
          </p>
        </details>
      )}
    </Card>
  );
}

function LiveStatus() {
  const workers = useQuery(api.workers.status, {});
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 15_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return <ServiceStatusCard workers={workers} now={now} />;
}

// A status-query failure must not take down the wallet or payment workspace.
class StatusBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <ServiceStatusCard now={Date.now()} unavailable />
    ) : (
      this.props.children
    );
  }
}

export function BackgroundStatus() {
  const ready = usePaymentsReady();
  return ready ? (
    <StatusBoundary>
      <LiveStatus />
    </StatusBoundary>
  ) : null;
}
