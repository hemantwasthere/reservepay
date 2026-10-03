import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { profileFields } from "./merchants";
import { validateProfile } from "../src/merchant/profile";
import { validateImageBytes } from "../src/merchant/merchant-image";
import type { Id } from "./_generated/dataModel";

export const save = action({
  args: {
    session: v.string(),
    profile: v.object(profileFields),
    image: v.bytes(),
    contentType: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"merchants">> => {
    // Authenticate before storing bytes, then recheck in the committing mutation
    // so a revoked session cannot finish an in-flight upload.
    await ctx.runQuery(internal.merchants.imageOwner, {
      session: args.session,
    });
    try {
      validateProfile(args.profile);
      validateImageBytes(new Uint8Array(args.image), args.contentType);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Invalid image.",
      );
    }
    const imageId = await ctx.storage.store(
      new Blob([args.image], { type: args.contentType }),
    );
    try {
      return await ctx.runMutation(internal.merchants.saveWithImage, {
        session: args.session,
        profile: args.profile,
        imageId,
      });
    } catch (error) {
      await ctx.storage.delete(imageId);
      throw error;
    }
  },
});
