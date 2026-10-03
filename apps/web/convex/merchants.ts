import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { validateProfile } from "../src/merchant/profile";
import { validateWallet } from "../src/lib/sign-in";
import { requireMerchant } from "./session";
import type { Id } from "./_generated/dataModel";
import type { MerchantProfile } from "../src/merchant/profile";

export const profileFields = {
  displayName: v.string(),
  website: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  description: v.optional(v.string()),
};

export const me = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const wallet = await requireMerchant(ctx, session);
    const row = await ctx.db
      .query("merchants")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .unique();
    return row
      ? {
          ...row,
          imageUrl: row.imageId ? await ctx.storage.getUrl(row.imageId) : null,
        }
      : null;
  },
});

async function saveProfile(
  ctx: MutationCtx,
  session: string,
  profile: MerchantProfile,
  imageId?: Id<"_storage"> | null,
) {
  const wallet = await requireMerchant(ctx, session);
  const clean = validateProfile(profile);
  const existing = await ctx.db
    .query("merchants")
    .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
    .unique();
  const now = Date.now();
  if (existing && now - existing.updatedAt < 6_000)
    throw new ConvexError("Please wait a moment before saving again.");
  const image = imageId === undefined ? {} : { imageId: imageId ?? undefined };
  if (existing) {
    await ctx.db.patch(existing._id, { ...clean, ...image, updatedAt: now });
    if (
      imageId !== undefined &&
      existing.imageId &&
      existing.imageId !== imageId
    )
      await ctx.storage.delete(existing.imageId);
    return existing._id;
  }
  return ctx.db.insert("merchants", {
    wallet,
    ...clean,
    ...image,
    createdAt: now,
    updatedAt: now,
  });
}

export const save = mutation({
  args: {
    session: v.string(),
    profile: v.object(profileFields),
    removeImage: v.optional(v.boolean()),
  },
  handler: (ctx, { session, profile, removeImage }) =>
    saveProfile(ctx, session, profile, removeImage ? null : undefined),
});

// Only the authenticated upload action can supply a storage ID. Public clients
// can never attach or delete a different merchant's image by guessing its ID.
export const saveWithImage = internalMutation({
  args: {
    session: v.string(),
    profile: v.object(profileFields),
    imageId: v.id("_storage"),
  },
  handler: (ctx, { session, profile, imageId }) =>
    saveProfile(ctx, session, profile, imageId),
});
export const imageOwner = internalQuery({
  args: { session: v.string() },
  handler: (ctx, { session }) => requireMerchant(ctx, session),
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
    return row
      ? {
          displayName: row.displayName,
          website: row.website,
          ...(row.imageId
            ? { imageUrl: await ctx.storage.getUrl(row.imageId) }
            : {}),
        }
      : null;
  },
});
