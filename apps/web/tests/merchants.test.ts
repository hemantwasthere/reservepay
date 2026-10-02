import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { validateProfile } from "../src/merchant/profile";
import { signIn } from "./session";

const modules = import.meta.glob("../convex/**/*.ts");
const seller = Keypair.generate();
const other = Keypair.generate();

const profile = {
  displayName: "Northstar Studio",
  website: "https://northstar.example.com",
  contactEmail: "hello@northstar.example.com",
  description: "Design and development studio.",
};

describe("merchant profiles", () => {
  it("saves a profile and keeps one row per wallet", async () => {
    const t = convexTest(schema, modules);
    const { token } = await signIn(t, seller);
    await t.mutation(api.merchants.save, { session: token, profile });
    const saved = await t.query(api.merchants.me, { session: token });
    expect(saved).toMatchObject(profile);
    expect(saved?.wallet).toBe(seller.publicKey.toBase58());
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("merchants")
        .withIndex("by_wallet", (q) =>
          q.eq("wallet", seller.publicKey.toBase58()),
        )
        .unique();
      if (row) await ctx.db.patch(row._id, { updatedAt: Date.now() - 60_000 });
    });
    await t.mutation(api.merchants.save, {
      session: token,
      profile: { ...profile, displayName: "Northstar Co" },
    });
    const rows = await t.run((ctx) => ctx.db.query("merchants").collect());
    expect(rows).toHaveLength(1);
    expect(
      (await t.query(api.merchants.me, { session: token }))?.displayName,
    ).toBe("Northstar Co");
  });
  it("never exposes the contact email publicly", async () => {
    const t = convexTest(schema, modules);
    const { token } = await signIn(t, seller);
    await t.mutation(api.merchants.save, { session: token, profile });
    const open = await t.query(api.merchants.publicProfile, {
      wallet: seller.publicKey.toBase58(),
    });
    expect(open).toEqual({
      displayName: profile.displayName,
      website: profile.website,
    });
    expect(open).not.toHaveProperty("contactEmail");
    expect(JSON.stringify(open)).not.toContain(profile.contactEmail);
  });
  it("keeps wallets from reading or editing each other's profile", async () => {
    const t = convexTest(schema, modules);
    const { token } = await signIn(t, seller);
    await t.mutation(api.merchants.save, { session: token, profile });
    const { token: otherToken } = await signIn(t, other);
    expect(await t.query(api.merchants.me, { session: otherToken })).toBeNull();
    await t.mutation(api.merchants.save, {
      session: otherToken,
      profile: { displayName: "Other Shop" },
    });
    const untouched = await t.query(api.merchants.publicProfile, {
      wallet: seller.publicKey.toBase58(),
    });
    expect(untouched?.displayName).toBe(profile.displayName);
    expect(
      await t.run((ctx) => ctx.db.query("merchants").collect()),
    ).toHaveLength(2);
  });
  it("requires a session and rate-limits rapid saves", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.merchants.save, { session: "ff".repeat(32), profile }),
    ).rejects.toThrow("Sign in again.");
    const { token } = await signIn(t, seller);
    await t.mutation(api.merchants.save, { session: token, profile });
    await expect(
      t.mutation(api.merchants.save, { session: token, profile }),
    ).rejects.toThrow("wait a moment");
  });
  it("validates the profile fields", () => {
    for (const overrides of [
      { displayName: "x" },
      { displayName: "x".repeat(61) },
      { displayName: "bad\nname" },
      { website: "http://insecure.example.com" },
      { website: "not a url" },
      { website: `https://${"x".repeat(220)}` },
      { contactEmail: "not-an-email" },
      { contactEmail: `${"x".repeat(130)}@example.com` },
      { description: "x".repeat(281) },
    ])
      expect(() => validateProfile({ ...profile, ...overrides })).toThrow();
    expect(
      validateProfile({ displayName: "  Northstar Studio  " }).displayName,
    ).toBe("Northstar Studio");
    expect(validateProfile({ displayName: "Northstar Studio" })).toEqual({
      displayName: "Northstar Studio",
      website: undefined,
      contactEmail: undefined,
      description: undefined,
    });
  });
});
