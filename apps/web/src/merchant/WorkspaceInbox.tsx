import { useEffect, useRef, useState } from "react";
import { Bell, Check, LoaderCircle } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Props = { active: WalletConnection | null; session: MerchantSession };
const labels = {
  refund_requested: "Refund requested",
  protection_ending: "Protection deadline reminder",
  protection_ended: "Protection deadline passed",
  refunded: "Payment refunded",
  completed: "Reserve released",
};
const descriptions = {
  refund_requested:
    "A refund was requested. A resolver must approve the refund on-chain while the order is still open.",
  protection_ending:
    "This order entered its final hour of protection. A refund request does not extend protection.",
  protection_ended:
    "The protection deadline has passed. Open the receipt to check whether the order is still open or already resolved.",
  refunded: "The full payment was returned to the original buyer.",
  completed:
    "The order was completed and its reserve released. It can no longer be refunded through ReservePay.",
};

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
    <ul className="divide-y divide-border">
      {entries.map((entry) => (
        <li key={entry._id} className="space-y-2 py-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-medium leading-normal tracking-normal">
              {labels[entry.kind]}
            </h3>
            {entry.readAt === undefined && (
              <span className="rounded bg-secondary px-2 py-1 text-[10px] text-primary">
                Unread
              </span>
            )}
          </div>
          <p className="break-words text-sm font-medium">{entry.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {descriptions[entry.kind]}
          </p>
          {(entry.kind === "protection_ending" ||
            entry.kind === "protection_ended" ||
            entry.kind === "refund_requested") && (
            <p className="text-xs text-muted-foreground">
              Protection deadline:{" "}
              <time dateTime={new Date(entry.expiresAt).toISOString()}>
                {new Date(entry.expiresAt).toLocaleString()}
              </time>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            <time dateTime={new Date(entry._creationTime).toISOString()}>
              {new Date(entry._creationTime).toLocaleString()}
            </time>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="text-xs text-primary underline underline-offset-4"
              href={`/pay/${entry.linkId}`}
            >
              View receipt
            </a>
            {entry.readAt === undefined && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Mark ${labels[entry.kind].toLowerCase()} for ${entry.title} as read`}
                onClick={() => onRead([entry._id])}
              >
                <Check className="size-3" /> Mark read
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Feed({ session }: { session: MerchantSession }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    { session: session.token! },
    { initialNumItems: 20 },
  );
  const markRead = useMutation(api.notifications.markRead);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = async (ids: Id<"notifications">[]) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await markRead({ session: session.token!, ids });
    } catch (error) {
      // A reply from the previous wallet must not expire the new session.
      if (!mounted.current) return;
      if (isExpiredSessionError(error)) session.expire();
      else setError("Could not mark these updates as read. Please try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const unread = results
    .filter((entry) => entry.readAt === undefined)
    .slice(0, 50);
  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {status === "LoadingFirstPage" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your inbox…
        </p>
      ) : (
        <>
          {unread.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void read(unread.map((entry) => entry._id))}
            >
              {busy && <LoaderCircle className="size-3 animate-spin" />}{" "}
              {unread.length === 50
                ? "Mark next 50 unread updates read"
                : "Mark displayed updates read"}
            </Button>
          )}
          {results.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="mx-auto mb-4 size-7 text-muted-foreground" />
              <h3 className="text-base font-medium tracking-normal">
                You’re all caught up
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Refund updates and protection reminders for this wallet will
                appear here.
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
            <Button
              className="mt-3 w-full"
              variant="outline"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
            >
              {status === "LoadingMore" ? "Loading…" : "Load older updates"}
            </Button>
          )}
        </>
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
}: Props & {
  count?: number;
  more?: boolean;
  ready?: boolean;
  error?: boolean;
  retry?: () => void;
}) {
  const [signing, setSigning] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Site navigation keeps the workspace mounted behind the landing page.
    // Close its portal when Back/Forward changes the visible page.
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
  const signedIn =
    ready && session.status === "signed-in" && Boolean(session.token);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
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
      </SheetTrigger>
      <SheetContent
        className="w-full gap-0 sm:max-w-lg motion-reduce:animate-none"
        aria-label="Inbox"
      >
        <SheetHeader className="border-b border-border p-6 pr-10">
          <SheetTitle className="text-xl leading-normal tracking-normal">
            Inbox
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            Refund updates and protection reminders. Open a receipt for its
            latest status.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {error ? (
            <div role="alert" className="space-y-3 text-sm">
              <p>Inbox could not load. Your payments are still available.</p>
              <Button variant="outline" onClick={retry}>
                Retry inbox
              </Button>
            </div>
          ) : !active ? (
            <p className="text-sm text-muted-foreground">
              Connect your wallet to see your inbox.
            </p>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">
              Inbox is unavailable until the payment service connects.
            </p>
          ) : !signedIn ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sign in with this wallet to see its updates and unread status.
                The signature does not transfer funds.
              </p>
              <Button
                variant="brand"
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
                <p className="text-xs text-muted-foreground">
                  Use a wallet that supports message signing.
                </p>
              )}
            </div>
          ) : (
            <Feed session={session} key={session.token} />
          )}
        </div>
        <p className="border-t border-border p-6 text-xs leading-relaxed text-muted-foreground">
          Reminders are checked every 2 minutes and may arrive later during
          delays. Check your protection deadline on the receipt. No email or
          push notifications are sent.
        </p>
      </SheetContent>
    </Sheet>
  );
}
function ConnectedInbox(props: Props) {
  const count = useQuery(
    api.notifications.unread,
    props.session.token ? { session: props.session.token } : "skip",
  );
  return (
    <InboxShell {...props} ready count={count?.count} more={count?.more} />
  );
}
export function WorkspaceInbox(props: Props) {
  const ready = usePaymentsReady();
  return ready ? (
    <SessionErrorBoundary
      resetKey={props.session.token}
      onExpire={props.session.expire}
      fallback={(_error, retry) => (
        <InboxShell {...props} error retry={retry} />
      )}
    >
      <ConnectedInbox {...props} />
    </SessionErrorBoundary>
  ) : (
    <InboxShell {...props} />
  );
}
