import { Component, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { usePaymentsReady } from "../payments/PaymentProvider";
import { Card } from "@/components/ui/card";

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
  return (
    <Card
      className="mt-7 flex flex-col gap-3 p-4 shadow-none"
      aria-label="Payment service status"
    >
      <h2 className="text-sm font-medium leading-normal tracking-normal">
        Payment service status
      </h2>
      {workers ? (
        <dl className="grid gap-4 text-xs sm:grid-cols-3">
          {workers.map((worker) => (
            <div key={worker.name} className="space-y-1">
              <dt className="font-medium">
                {worker.name === "keeper"
                  ? "Automatic releases"
                  : worker.name === "notifications"
                    ? "Inbox reminders"
                    : "Payment updates"}
              </dt>
              <dd className="text-muted-foreground" aria-live="polite">
                {describeWorker(worker, now)}
              </dd>
              <dd className="text-muted-foreground">
                {worker.lastSuccessAt === null
                  ? "No successful check yet"
                  : `Last successful check ${Math.max(0, Math.floor((now - worker.lastSuccessAt) / 60_000))} min ago`}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">
          Checking service status…
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Payment updates and inbox reminders run every 2 minutes; automatic
        releases run every 5 minutes. If delayed, refresh a receipt to check its
        latest status. Expired orders can still be completed manually. Pending
        refund requests require a resolver.
      </p>
    </Card>
  );
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
      <p className="mt-7 text-xs text-muted-foreground" role="status">
        Service status is unavailable. Reload to reconnect.
      </p>
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
