import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function findSession(
  ctx: QueryCtx | MutationCtx,
  session: string,
): Promise<Doc<"sessions"> | null> {
  if (!/^[a-f0-9]{64}$/.test(session)) return null;
  const tokenHash = await hashToken(session);
  const row = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  return row && row.expiresAt > Date.now() ? row : null;
}

export async function requireMerchant(
  ctx: QueryCtx | MutationCtx,
  session: string,
): Promise<string> {
  const row = await findSession(ctx, session);
  if (!row) throw new ConvexError("Sign in again.");
  return row.wallet;
}
