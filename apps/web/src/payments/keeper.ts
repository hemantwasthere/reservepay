// Pure keeper selection logic, shared by the Convex keeper action and tests.
// Units are explicit and must not be mixed: expiresAt and chainNow are
// SECONDS (on-chain i64 / Clock unix_timestamp); wallNow is MILLISECONDS
// (Date.now(), the same clock and units requestRefund compares against).

export type KeeperOrder = {
  order: string;
  merchantPda: string;
  authority: string;
  reference: string;
  expiresAt: number; // seconds
};

export type KeeperLink = { id: string; refundPending: boolean };

export type ReleasableOrder = KeeperOrder & { linkId?: string };

// A refund request can be committed while receipt.expiresAt (ms) is still in
// the future. payments.requestRefund refuses an undisputed request once its
// own clock is RELEASE_GRACE_MS past expiry. The keeper waits a further
// RELEASE_MARGIN_MS before selecting, so a request mutation that started
// just inside the grace and commits after the keeper reads the links — or a
// keeper clock a little ahead of the mutation's — still cannot race a
// release.
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
      return links[`${order.authority}:${order.reference}`]?.refundPending !== true;
    })
    .sort((a, b) => a.expiresAt - b.expiresAt)
    .slice(0, limit)
    .map((order) => {
      const linkId = links[`${order.authority}:${order.reference}`]?.id;
      return linkId ? { ...order, linkId } : order;
    });
}
