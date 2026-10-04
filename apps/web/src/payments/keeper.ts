// Pure keeper selection logic, shared by the Convex keeper action and tests.
// Units are explicit and must not be mixed: expiresAt and chainNow are
// SECONDS (on-chain i64 / Clock unix_timestamp); wallNow is MILLISECONDS on
// the Convex backend clock — returned by keeper.linksForReferences, the same
// clock payments.requestRefund refuses late requests by. Never pass the
// keeper action's own Date.now(): nothing keeps it in sync with the backend.

export type KeeperOrder = {
  order: string;
  merchantPda: string;
  authority: string;
  reference: string;
  expiresAt: number; // seconds
};

export type KeeperLink = { id: string; refundPending: boolean };

export type ReleasableOrder = KeeperOrder & { linkId?: string };

// payments.requestRefund refuses an undisputed request once the backend
// clock is RELEASE_GRACE_MS past expiry. The keeper selects only when the
// backend clock (wallNow) is a further RELEASE_MARGIN_MS past that, so a
// request mutation that started just inside the grace and commits after the
// keeper's link lookup still cannot race a release; the margin only has to
// cover a mutation's run time (Convex caps it at about a second).
export const RELEASE_GRACE_MS = 60_000;
export const RELEASE_MARGIN_MS = 5_000;

export function selectReleasable<T extends KeeperOrder>({
  openOrders,
  links,
  chainNow,
  wallNow,
  limit = 5,
}: {
  openOrders: T[];
  links: Record<string, KeeperLink>;
  chainNow: number; // seconds
  wallNow: number; // milliseconds
  limit?: number;
}): (T & { linkId?: string })[] {
  return openOrders
    .filter((order) => {
      if (order.expiresAt > chainNow) return false;
      if (order.expiresAt * 1000 + RELEASE_GRACE_MS + RELEASE_MARGIN_MS > wallNow)
        return false;
      // Past the cutoff on the backend clock, so any request still to come
      // is refused — including one on a link created later for this order.
      // What remains is a request already pending.
      return links[`${order.authority}:${order.reference}`]?.refundPending !== true;
    })
    .sort((a, b) => a.expiresAt - b.expiresAt)
    .slice(0, limit)
    .map((order) => {
      const linkId = links[`${order.authority}:${order.reference}`]?.id;
      return linkId ? { ...order, linkId } : order;
    });
}
