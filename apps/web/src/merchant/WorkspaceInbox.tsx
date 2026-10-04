import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { WalletConnection } from "../lib/WalletControl";
import {
  SessionErrorBoundary,
  isExpiredSessionError,
  type MerchantSession,
} from "../lib/useMerchantSession";
import { usePaymentsReady } from "../payments/PaymentProvider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = { active: WalletConnection | null; session: MerchantSession };
type ShellControl = { open: boolean; onOpenChange: (open: boolean) => void };
const labels = {
  refund_requested: "Refund requested",
  protection_ending: "Protection ending soon",
  protection_ended: "Protection deadline passed",
  refunded: "Payment refunded",
  completed: "Reserve released",
};
const descriptions = {
  refund_requested:
    "A resolver must approve the refund while the order is still open.",
  protection_ending:
    "This order entered its final hour. A refund request does not extend protection.",
  protection_ended:
    "Open the receipt to check whether this order is still open or already resolved.",
  refunded: "The full payment was returned to the original buyer.",
  completed:
    "This order is complete and can no longer be refunded through ReservePay.",
};
const icons = {
  refund_requested: Undo2,
  protection_ending: Clock3,
  protection_ended: Clock3,
  refunded: Undo2,
  completed: ShieldCheck,
};

function InboxDrawing() {
  return (
    <svg
      viewBox="0 0 112 80"
      className="mb-3 h-20 w-28 text-primary"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="56"
        cy="70"
        rx="30"
        ry="4"
        fill="currentColor"
        opacity=".06"
      />
      <path
        d="M29 31 38 16h36l9 15v28a5 5 0 0 1-5 5H34a5 5 0 0 1-5-5V31Z"
        fill="currentColor"
        fillOpacity=".05"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M29 37h17l4 8h12l4-8h17M44 25h24M44 31h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".55"
      />
      <circle
        cx="82"
        cy="20"
        r="12"
        className="fill-card"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m77 20 3 3 6-6M18 23v6m-3-3h6M91 46l4 3m-72 0-4 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="24" cy="13" r="1.5" fill="currentColor" opacity=".5" />
    </svg>
  );
}

export function NotificationList({
  entries,
  busy,
  onRead,
}: {
  entries: Doc<"notifications">[];
  busy: boolean;
  onRead: (ids: Id<"notifications">[]) => void;
}) {
  return (
    <ul className="divide-y divide-border/70">
      {entries.map((entry) => {
        const Icon = icons[entry.kind];
        const unread = entry.readAt === undefined;
        return (
          <li
            key={entry._id}
            className={`flex gap-3 px-4 py-4 transition-colors ${unread ? "bg-primary/[.035]" : ""}`}
          >
            <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background text-primary">
              <Icon className="size-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xs font-medium leading-relaxed tracking-normal">
                  {labels[entry.kind]}
                </h3>
                {unread && (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary">
                    <span className="sr-only">Unread</span>
                  </span>
                )}
              </div>
              <p className="break-words text-xs font-medium">{entry.title}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {descriptions[entry.kind]}
              </p>
              {(entry.kind === "protection_ending" ||
                entry.kind === "protection_ended" ||
                entry.kind === "refund_requested") && (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Protection ends:{" "}
                  <time dateTime={new Date(entry.expiresAt).toISOString()}>
                    {new Date(entry.expiresAt).toLocaleString()}
                  </time>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                <a
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline underline-offset-4"
                  href={`/pay/${entry.linkId}`}
                >
                  View receipt{" "}
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
                {unread && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px]"
                    disabled={busy}
                    aria-label={`Mark ${labels[entry.kind].toLowerCase()} for ${entry.title} as read`}
                    onClick={() => onRead([entry._id])}
                  >
                    <Check className="size-3" /> Mark read
                  </Button>
                )}
              </div>
              <time
                className="block text-[10px] text-muted-foreground"
                dateTime={new Date(entry._creationTime).toISOString()}
              >
                {new Date(entry._creationTime).toLocaleString()}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Subscribe outside the popover: closing it must not drop the loaded pages or
// restart the query. The keyed owner below discards all data on session change.
function useInboxFeed(session: MerchantSession) {
  const query = usePaginatedQuery(
    api.notifications.list,
    session.token ? { session: session.token } : "skip",
    { initialNumItems: 20 },
  );
  const markRead = useMutation(api.notifications.markRead);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = async (ids: Id<"notifications">[]) => {
    if (pending.current || !session.token) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await markRead({ session: session.token, ids });
    } catch (error) {
      if (!mounted.current) return;
      if (isExpiredSessionError(error)) session.expire();
      else setError("Could not mark these updates as read. Please try again.");
    } finally {
      if (mounted.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return { ...query, read, busy, error };
}
type FeedState = ReturnType<typeof useInboxFeed>;

function Feed({ feed }: { feed: FeedState }) {
  const { results, status, loadMore, read, busy, error } = feed;
  const unread = results
    .filter((entry) => entry.readAt === undefined)
    .slice(0, 50);
  if (status === "LoadingFirstPage")
    return (
      <div role="status" className="space-y-5 px-5 py-6">
        <span className="sr-only">Loading your notifications</span>
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            aria-hidden="true"
            className="flex gap-3 motion-safe:animate-pulse"
          >
            <div className="size-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-2 w-2/3 rounded bg-muted" />
              <div className="h-2 w-full rounded bg-muted" />
              <div className="h-2 w-2/5 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <>
      {error && (
        <p role="alert" className="mx-4 mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {unread.length > 0 && (
        <div className="flex justify-end border-b border-border/70 px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground"
            disabled={busy}
            onClick={() => void read(unread.map((entry) => entry._id))}
          >
            {busy ? (
              <LoaderCircle className="size-3 motion-safe:animate-spin" />
            ) : (
              <CheckCheck className="size-3" />
            )}
            {unread.length === 50
              ? "Mark next 50 as read"
              : "Mark displayed as read"}
          </Button>
        </div>
      )}
      {results.length === 0 ? (
        <div className="flex h-full min-h-56 flex-col items-center justify-center px-7 py-5 text-center">
          <InboxDrawing />
          <h3 className="text-sm font-medium tracking-normal">
            You’re all caught up
          </h3>
          <p className="mt-2 max-w-60 text-xs leading-relaxed text-muted-foreground">
            Refund updates and protection reminders will appear here.
          </p>
        </div>
      ) : (
        <NotificationList
          entries={results}
          busy={busy}
          onRead={(ids) => void read(ids)}
        />
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="p-3">
          <Button
            className="w-full text-xs"
            variant="outline"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(20)}
          >
            {status === "LoadingMore" ? "Loading…" : "Load older updates"}
          </Button>
        </div>
      )}
    </>
  );
}

function InboxShell({
  active,
  session,
  count,
  more,
  ready,
  error,
  retry,
  feed,
  open,
  onOpenChange,
}: Props &
  ShellControl & {
    count?: number;
    more?: boolean;
    ready?: boolean;
    error?: boolean;
    retry?: () => void;
    feed?: FeedState;
  }) {
  const [signing, setSigning] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const signedIn =
    ready && session.status === "signed-in" && Boolean(session.token);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 shrink-0"
          aria-label={
            count
              ? `Inbox, ${count}${more ? "+" : ""} unread updates`
              : "Open inbox"
          }
        >
          <Bell className="size-[17px]" aria-hidden="true" />
          {Boolean(count) && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground"
            >
              {count}
              {more ? "+" : ""}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        collisionPadding={12}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(420px,var(--radix-popover-content-available-height))] w-[380px] max-w-[calc(100vw-40px)] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-lg duration-150 motion-reduce:animate-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2
              id={titleId}
              className="text-sm font-medium leading-normal tracking-normal"
            >
              Notifications
            </h2>
            <p
              id={descriptionId}
              className="mt-0.5 text-[11px] text-muted-foreground"
            >
              Your payments, kept in view.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Close notifications"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <div
          className="h-72 min-h-0 overflow-y-auto overscroll-contain"
          data-inbox-body
        >
          {error ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs"
            >
              <Bell className="size-6 text-muted-foreground" />
              <p>
                Inbox could not load.
                <br />
                Your payments are still available.
              </p>
              <Button variant="outline" size="sm" onClick={retry}>
                Retry inbox
              </Button>
            </div>
          ) : !active ? (
            <div className="flex h-full flex-col items-center justify-center px-7 text-center">
              <InboxDrawing />
              <h3 className="text-sm font-medium tracking-normal">
                Your updates live here
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Connect your wallet to see your inbox.
              </p>
            </div>
          ) : !ready ? (
            <p className="p-5 text-xs leading-relaxed text-muted-foreground">
              Inbox is unavailable until the payment service connects.
            </p>
          ) : !signedIn ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-7 text-center">
              <Bell className="mb-1 size-6 text-primary" />
              <h3 className="text-sm font-medium tracking-normal">
                Updates, just for you
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Sign in to see this wallet’s updates.
                <br />
                This signature does not transfer funds.
              </p>
              <Button
                variant="brand"
                size="sm"
                disabled={
                  signing ||
                  session.status === "checking" ||
                  !active.wallet.signMessage
                }
                onClick={() => {
                  setSigning(true);
                  void session.signIn().finally(() => setSigning(false));
                }}
              >
                {signing
                  ? "Check your wallet…"
                  : session.status === "checking"
                    ? "Checking session…"
                    : "Sign in to your inbox"}
              </Button>
              {!active.wallet.signMessage && (
                <p className="text-[11px] text-muted-foreground">
                  Use a wallet that supports message signing.
                </p>
              )}
            </div>
          ) : (
            feed && <Feed feed={feed} />
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2 border-t border-border bg-muted/30 px-4 py-3">
          <Clock3
            className="mt-0.5 size-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            In-app updates · checked every 2 min. For the latest status and
            protection deadline, open your receipt.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
function ConnectedInbox(props: Props & ShellControl) {
  const count = useQuery(
    api.notifications.unread,
    props.session.token ? { session: props.session.token } : "skip",
  );
  const feed = useInboxFeed(props.session);
  return (
    <InboxShell
      {...props}
      ready
      count={count?.count}
      more={count?.more}
      feed={feed}
    />
  );
}
export function WorkspaceInbox(props: Props) {
  const ready = usePaymentsReady();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
  const shellProps = { ...props, open, onOpenChange: setOpen };
  return ready ? (
    <SessionErrorBoundary
      resetKey={props.session.token}
      onExpire={props.session.expire}
      fallback={(_error, retry) => (
        <InboxShell {...shellProps} error retry={retry} />
      )}
    >
      <ConnectedInbox
        {...shellProps}
        key={props.session.token ?? "signed-out"}
      />
    </SessionErrorBoundary>
  ) : (
    <InboxShell {...shellProps} />
  );
}
