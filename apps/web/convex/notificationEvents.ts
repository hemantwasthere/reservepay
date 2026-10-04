import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const notificationKind = v.union(
  v.literal("refund_requested"),
  v.literal("protection_ending"),
  v.literal("protection_ended"),
  v.literal("refunded"),
  v.literal("completed"),
);
export type NotificationKind = typeof notificationKind.type;

// Called only from verified receipt mutations or the internal reminder sweep.
// The unique lookup and insert share a transaction, so concurrent retries
// deliver once per recipient/order/event and never reset a read receipt.
export async function notifyOrder(
  ctx: MutationCtx,
  link: Doc<"paymentLinks">,
  kind: NotificationKind,
  recipients: (string | undefined)[],
) {
  let created = 0;
  for (const wallet of new Set(
    recipients.filter((value): value is string => Boolean(value)),
  )) {
    const previous = await ctx.db
      .query("notifications")
      .withIndex("by_event", (q) =>
        q.eq("wallet", wallet).eq("linkId", link._id).eq("kind", kind),
      )
      .unique();
    if (previous) continue;
    await ctx.db.insert("notifications", {
      wallet,
      linkId: link._id,
      kind,
      title: link.title,
      expiresAt: link.receipt!.expiresAt,
    });
    created += 1;
  }
  return created;
}
