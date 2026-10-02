import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { signInMessage } from "../src/lib/sign-in";
import { signIn, TEST_DOMAIN } from "./session";

const modules = import.meta.glob("../convex/**/*.ts");
const seller = Keypair.generate();
const other = Keypair.generate();

describe("wallet sign-in", () => {
  it("issues a session for a valid signature and me returns the wallet", async () => {
    const t = convexTest(schema, modules);
    const { token, expiresAt } = await signIn(t, seller);
    expect(await t.query(api.auth.me, { session: token })).toEqual({
      wallet: seller.publicKey.toBase58(),
      expiresAt,
    });
  });
  it("accepts a nonce only once", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const challenge = await t.mutation(api.auth.requestNonce, { wallet });
    const signature = bs58.encode(
      nacl.sign.detached(
        signInMessage({ ...challenge, wallet, domain: TEST_DOMAIN }),
        seller.secretKey,
      ),
    );
    const request = { ...challenge, wallet, domain: TEST_DOMAIN, signature };
    await t.action(api.authActions.signIn, request);
    await expect(
      t.action(api.authActions.signIn, request),
    ).rejects.toThrow("expired");
  });
  it("rejects an expired nonce", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const nonce = "ab".repeat(16);
    const issuedAt = Date.now() - 600_000;
    const expiresAt = Date.now() - 1;
    await t.run((ctx) =>
      ctx.db.insert("authNonces", { wallet, nonce, issuedAt, expiresAt, used: false }),
    );
    const signature = bs58.encode(
      nacl.sign.detached(
        signInMessage({ wallet, nonce, issuedAt, expiresAt, domain: TEST_DOMAIN }),
        seller.secretKey,
      ),
    );
    await expect(
      t.action(api.authActions.signIn, {
        wallet,
        nonce,
        issuedAt,
        expiresAt,
        domain: TEST_DOMAIN,
        signature,
      }),
    ).rejects.toThrow("expired");
  });
  it("rejects a signature from the wrong wallet", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const challenge = await t.mutation(api.auth.requestNonce, { wallet });
    const signature = bs58.encode(
      nacl.sign.detached(
        signInMessage({ ...challenge, wallet, domain: TEST_DOMAIN }),
        other.secretKey,
      ),
    );
    await expect(
      t.action(api.authActions.signIn, {
        ...challenge,
        wallet,
        domain: TEST_DOMAIN,
        signature,
      }),
    ).rejects.toThrow("did not approve");
  });
  it("rejects a domain mismatch, including against SITE_ORIGIN", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const challenge = await t.mutation(api.auth.requestNonce, { wallet });
    const sign = (domain: string) =>
      bs58.encode(
        nacl.sign.detached(
          signInMessage({ ...challenge, wallet, domain }),
          seller.secretKey,
        ),
      );
    await expect(
      t.action(api.authActions.signIn, {
        ...challenge,
        wallet,
        domain: "evil.example.com",
        signature: sign("evil.example.com"),
      }),
    ).rejects.toThrow("another site");
    const previous = process.env.SITE_ORIGIN;
    process.env.SITE_ORIGIN = "https://reservepay.example.com";
    try {
      await expect(
        t.action(api.authActions.signIn, {
          ...challenge,
          wallet,
          domain: TEST_DOMAIN,
          signature: sign(TEST_DOMAIN),
        }),
      ).rejects.toThrow("another site");
      const session = await t.action(api.authActions.signIn, {
        ...challenge,
        wallet,
        domain: "reservepay.example.com",
        signature: sign("reservepay.example.com"),
      });
      expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      if (previous === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = previous;
    }
  });
  it("rejects expired sessions and invalidates them on sign out", async () => {
    const t = convexTest(schema, modules);
    const { token } = await signIn(t, seller);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("sessions")
        .withIndex("by_wallet", (q) =>
          q.eq("wallet", seller.publicKey.toBase58()),
        )
        .unique();
      if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
    });
    await expect(t.query(api.payments.list, { session: token })).rejects.toThrow(
      "Sign in again.",
    );
    const fresh = await signIn(t, seller);
    await t.mutation(api.auth.signOut, { session: fresh.token });
    expect(await t.query(api.auth.me, { session: fresh.token })).toBeNull();
    await expect(
      t.query(api.payments.list, { session: fresh.token }),
    ).rejects.toThrow("Sign in again.");
  });
  it("rate-limits nonce requests per wallet", async () => {
    const t = convexTest(schema, modules);
    const wallet = other.publicKey.toBase58();
    for (let i = 0; i < 5; i++)
      await t.mutation(api.auth.requestNonce, { wallet });
    await expect(t.mutation(api.auth.requestNonce, { wallet })).rejects.toThrow(
      "wait a minute",
    );
  });
});
