import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { issueNonce, NONCE_TTL } from "../convex/signInNonce";
import { signInMessage } from "../src/lib/sign-in";
import { signIn, TEST_DOMAIN } from "./session";

const modules = import.meta.glob("../convex/**/*.ts");

afterEach(() => vi.useRealTimers());
const seller = Keypair.generate();
const other = Keypair.generate();

type Challenge = { nonce: string; issuedAt: number; expiresAt: number };
const signed = (
  challenge: Challenge,
  keypair: Keypair,
  { wallet = seller.publicKey.toBase58(), domain = TEST_DOMAIN } = {},
) => ({
  ...challenge,
  wallet,
  domain,
  signature: bs58.encode(
    nacl.sign.detached(
      signInMessage({ ...challenge, wallet, domain }),
      keypair.secretKey,
    ),
  ),
});

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
    const challenge = await t.action(api.authActions.requestNonce, { wallet });
    const request = signed(challenge, seller);
    await t.action(api.authActions.signIn, request);
    await expect(t.action(api.authActions.signIn, request)).rejects.toThrow(
      "expired",
    );
  });
  it("rejects an expired nonce", async () => {
    const t = convexTest(schema, modules);
    const challenge = await issueNonce(
      process.env.SIGN_IN_SECRET!,
      seller.publicKey.toBase58(),
      Date.now() - NONCE_TTL - 1,
    );
    await expect(
      t.action(api.authActions.signIn, signed(challenge, seller)),
    ).rejects.toThrow("expired");
  });
  it("rejects nonces it did not issue or whose terms were altered", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const challenge = await t.action(api.authActions.requestNonce, { wallet });
    const forged = await issueNonce("another-secret-0123456789abcdef0123", wallet);
    await expect(
      t.action(api.authActions.signIn, signed(forged, seller)),
    ).rejects.toThrow("expired");
    await expect(
      t.action(
        api.authActions.signIn,
        signed({ ...challenge, expiresAt: challenge.expiresAt + 1 }, seller),
      ),
    ).rejects.toThrow();
    // A nonce issued for one wallet cannot sign in another.
    await expect(
      t.action(
        api.authActions.signIn,
        signed(challenge, other, { wallet: other.publicKey.toBase58() }),
      ),
    ).rejects.toThrow("expired");
  });
  it("rejects a signature from the wrong wallet", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const challenge = await t.action(api.authActions.requestNonce, { wallet });
    await expect(
      t.action(api.authActions.signIn, signed(challenge, other)),
    ).rejects.toThrow("did not approve");
  });
  it("rejects a domain mismatch, including against SITE_ORIGIN", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    const challenge = await t.action(api.authActions.requestNonce, { wallet });
    await expect(
      t.action(
        api.authActions.signIn,
        signed(challenge, seller, { domain: "evil.example.com" }),
      ),
    ).rejects.toThrow("another site");
    const previous = process.env.SITE_ORIGIN;
    process.env.SITE_ORIGIN = "https://reservepay.example.com";
    try {
      await expect(
        t.action(api.authActions.signIn, signed(challenge, seller)),
      ).rejects.toThrow("another site");
      const session = await t.action(
        api.authActions.signIn,
        signed(challenge, seller, { domain: "reservepay.example.com" }),
      );
      expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      if (previous === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = previous;
    }
  });
  it("refuses to sign in when the secret is not configured", async () => {
    const t = convexTest(schema, modules);
    const previous = process.env.SIGN_IN_SECRET;
    delete process.env.SIGN_IN_SECRET;
    try {
      await expect(
        t.action(api.authActions.requestNonce, {
          wallet: seller.publicKey.toBase58(),
        }),
      ).rejects.toThrow("not configured");
    } finally {
      process.env.SIGN_IN_SECRET = previous;
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
    await expect(
      t.query(api.payments.listForSessionPaginated, {
        session: token,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Sign in again.");
    const fresh = await signIn(t, seller);
    await t.mutation(api.auth.signOut, { session: fresh.token });
    expect(await t.query(api.auth.me, { session: fresh.token })).toBeNull();
    await expect(
      t.query(api.payments.listForSessionPaginated, {
        session: fresh.token,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Sign in again.");
  });
  it("issues nonces without writing anything or locking anyone out", async () => {
    const t = convexTest(schema, modules);
    const wallet = other.publicKey.toBase58();
    for (let i = 0; i < 50; i++) {
      const challenge = await t.action(api.authActions.requestNonce, { wallet });
      expect(challenge.nonce).toMatch(/^[a-f0-9]{96}$/);
      expect(challenge.expiresAt - challenge.issuedAt).toBe(NONCE_TTL);
    }
    expect(await t.run((ctx) => ctx.db.query("usedNonces").collect())).toEqual(
      [],
    );
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toEqual([]);
    expect((await signIn(t, other)).token).toMatch(/^[a-f0-9]{64}$/);
  });
  it("refuses to create a session for a nonce that expired before the write", async () => {
    const t = convexTest(schema, modules);
    // The action verified the nonce earlier; by the time the mutation runs it
    // has expired and cleanup may have removed its used-nonce record.
    await expect(
      t.mutation(internal.auth.createSession, {
        wallet: seller.publicKey.toBase58(),
        nonce: "cd".repeat(48),
        nonceExpiresAt: Date.now() - 1,
        tokenHash: "aa".repeat(32),
      }),
    ).rejects.toThrow("expired");
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toEqual(
      [],
    );
  });
  it("treats a session expiring exactly now as expired during cleanup", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        wallet: seller.publicKey.toBase58(),
        tokenHash: "bb".repeat(32),
        createdAt: now - 1_000,
        expiresAt: now,
      });
      await ctx.db.insert("usedNonces", {
        nonce: "ef".repeat(48),
        expiresAt: now,
      });
    });
    // expiresAt <= now is expired, as findSession already treats it.
    expect(await t.mutation(internal.auth.cleanup, {})).toBe(2);
  });
  it("cleans up expired nonce records, sessions, and legacy rows", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    await t.run(async (ctx) => {
      await ctx.db.insert("usedNonces", {
        nonce: "cd".repeat(48),
        expiresAt: Date.now() - 1,
      });
      await ctx.db.insert("sessions", {
        wallet,
        tokenHash: "aa".repeat(32),
        createdAt: Date.now() - 8 * 24 * 60 * 60_000,
        expiresAt: Date.now() - 1,
      });
      await ctx.db.insert("authNonces", {
        wallet,
        requester: "legacy",
        nonce: "ef".repeat(16),
        issuedAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        used: false,
      });
    });
    const { token } = await signIn(t, seller);
    expect(await t.mutation(internal.auth.cleanup, {})).toBe(3);
    expect(await t.run((ctx) => ctx.db.query("authNonces").collect())).toEqual(
      [],
    );
    // The live session and its still-unexpired nonce record survive.
    expect(
      await t.run((ctx) => ctx.db.query("usedNonces").collect()),
    ).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toHaveLength(
      1,
    );
    expect(await t.query(api.auth.me, { session: token })).not.toBeNull();
  });
  it("reschedules cleanup until a large backlog is drained", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 1_200; i++)
        await ctx.db.insert("usedNonces", {
          nonce: i.toString(16).padStart(96, "0"),
          expiresAt: Date.now() - 1,
        });
    });
    expect(await t.mutation(internal.auth.cleanup, {})).toBe(500);
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run((ctx) => ctx.db.query("usedNonces").collect())).toEqual(
      [],
    );
  });
});
