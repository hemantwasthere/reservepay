import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { signIn } from "./session";
import {
  MAX_IMAGE_BYTES,
  validateImageBytes,
  validateSourceImage,
} from "../src/merchant/merchant-image";
const modules = import.meta.glob("../convex/**/*.ts");
const profile = {
  displayName: "Image test merchant",
  contactEmail: "private@example.com",
};
const png = () =>
  Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  ).buffer;
async function allowSave(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("merchants").collect())
      await ctx.db.patch(row._id, { updatedAt: 0 });
  });
}

describe("merchant images", () => {
  it("validates size, declared type and raster signature", () => {
    expect(() =>
      validateSourceImage({ type: "image/png", size: 100 }),
    ).not.toThrow();
    for (const file of [
      { type: "image/svg+xml", size: 100 },
      { type: "image/png", size: 3_000_000 },
      { type: "image/jpeg", size: 0 },
    ])
      expect(() => validateSourceImage(file)).toThrow();
    expect(() =>
      validateImageBytes(new Uint8Array(png()), "image/png"),
    ).not.toThrow();
    expect(() =>
      validateImageBytes(new Uint8Array(png()), "image/jpeg"),
    ).toThrow();
    expect(() =>
      validateImageBytes(
        new TextEncoder().encode('<svg onload="alert(1)"/>'),
        "image/png",
      ),
    ).toThrow();
    expect(() =>
      validateImageBytes(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/png"),
    ).toThrow();
  });
  it("stores an image for the authenticated merchant and exposes only public branding", async () => {
    const t = convexTest(schema, modules),
      wallet = Keypair.generate();
    const { token } = await signIn(t, wallet);
    await t.action(api.merchantImages.save, {
      session: token,
      profile,
      image: png(),
      contentType: "image/png",
    });
    const own = await t.query(api.merchants.me, { session: token });
    expect(own?.imageId).toBeTruthy();
    expect(own?.imageUrl).toBeTruthy();
    const visible = await t.query(api.merchants.publicProfile, {
      wallet: wallet.publicKey.toBase58(),
    });
    expect(visible?.imageUrl).toBe(own?.imageUrl);
    expect(visible).not.toHaveProperty("contactEmail");
    expect(visible).not.toHaveProperty("imageId");
    expect(
      await t.run(async (ctx) => (await ctx.storage.get(own!.imageId!))?.type),
    ).toBe("image/png");
  });
  it("preserves images on normal profile edits and deletes replaced or removed files", async () => {
    const t = convexTest(schema, modules),
      { token } = await signIn(t, Keypair.generate());
    const upload = () =>
      t.action(api.merchantImages.save, {
        session: token,
        profile,
        image: png(),
        contentType: "image/png",
      });
    await upload();
    const first = (await t.query(api.merchants.me, { session: token }))!
      .imageId!;
    await allowSave(t);
    await t.mutation(api.merchants.save, {
      session: token,
      profile: { ...profile, displayName: "Updated merchant" },
    });
    expect((await t.query(api.merchants.me, { session: token }))!.imageId).toBe(
      first,
    );
    await allowSave(t);
    await upload();
    const second = (await t.query(api.merchants.me, { session: token }))!
      .imageId!;
    expect(second).not.toBe(first);
    expect(await t.run((ctx) => ctx.storage.get(first))).toBeNull();
    await allowSave(t);
    await t.mutation(api.merchants.save, {
      session: token,
      profile,
      removeImage: true,
    });
    expect(
      (await t.query(api.merchants.me, { session: token }))!.imageUrl,
    ).toBeNull();
    expect(await t.run((ctx) => ctx.storage.get(second))).toBeNull();
  });
  it("rejects invalid or revoked sessions, malformed images and cleans rejected uploads", async () => {
    const t = convexTest(schema, modules),
      { token } = await signIn(t, Keypair.generate());
    await expect(
      t.action(api.merchantImages.save, {
        session: "bad",
        profile,
        image: png(),
        contentType: "image/png",
      }),
    ).rejects.toThrow("Sign in again");
    await expect(
      t.action(api.merchantImages.save, {
        session: token,
        profile,
        image: new ArrayBuffer(0),
        contentType: "image/png",
      }),
    ).rejects.toThrow("256 KB");
    await t.action(api.merchantImages.save, {
      session: token,
      profile,
      image: png(),
      contentType: "image/png",
    });
    await expect(
      t.action(api.merchantImages.save, {
        session: token,
        profile,
        image: png(),
        contentType: "image/png",
      }),
    ).rejects.toThrow("wait a moment");
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(1);
    await t.mutation(api.auth.signOut, { session: token });
    await expect(
      t.action(api.merchantImages.save, {
        session: token,
        profile,
        image: png(),
        contentType: "image/png",
      }),
    ).rejects.toThrow("Sign in again");
  });
  it("cannot replace or remove another wallet's image", async () => {
    const t = convexTest(schema, modules),
      seller = Keypair.generate();
    const { token } = await signIn(t, seller),
      other = await signIn(t, Keypair.generate());
    await t.action(api.merchantImages.save, {
      session: token,
      profile,
      image: png(),
      contentType: "image/png",
    });
    const imageId = (await t.query(api.merchants.me, { session: token }))!
      .imageId!;
    await t.mutation(api.merchants.save, {
      session: other.token,
      profile,
      removeImage: true,
    });
    expect((await t.query(api.merchants.me, { session: token }))!.imageId).toBe(
      imageId,
    );
    expect(
      await t.run(async (ctx) => Boolean(await ctx.storage.get(imageId))),
    ).toBe(true);
    await t.mutation(api.auth.signOut, { session: token });
    await expect(
      t.mutation(internal.merchants.saveWithImage, {
        session: token,
        profile,
        imageId,
      }),
    ).rejects.toThrow("Sign in again");
  });
});
