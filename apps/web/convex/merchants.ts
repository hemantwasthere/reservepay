import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateProfile } from "../src/merchant/profile";
import { validateWallet } from "../src/lib/sign-in";
import { requireMerchant } from "./session";

const profileFields = {
  displayName: v.string(),
  website: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  description: v.optional(v.string()),
};

export const me = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const wallet = await requireMerchant(ctx, session);
    return ctx.db
      .query("merchants")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .unique();
  },
});

export const save = mutation({
  args: { session: v.string(), profile: v.object(profileFields) },
  handler: async (ctx, { session, profile }) => {
    const wallet = await requireMerchant(ctx, session);
    const clean = validateProfile(profile);
    const existing = await ctx.db
      .query("merchants")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .unique();
    const now = Date.now();
    // Rate-limit: one save every 6 seconds per wallet (10 per minute).
    if (existing && now - existing.updatedAt < 6_000)
      throw new ConvexError("Please wait a moment before saving again.");
    if (existing) {
      await ctx.db.patch(existing._id, { ...clean, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("merchants", {
      wallet,
      ...clean,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// The public profile only exposes what a buyer may see. The contact email is
// merchant-private and must never be returned here.
export const publicProfile = query({
  args: { wallet: v.string() },
  handler: async (ctx, { wallet }) => {
    validateWallet(wallet);
    const row = await ctx.db
      .query("merchants")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .unique();
    return row ? { displayName: row.displayName, website: row.website } : null;
  },
});
