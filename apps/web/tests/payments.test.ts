import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  paymentApproval,
  referenceBytes,
  validateTerms,
  type PaymentTerms,
} from "../src/payments/terms";
import { signIn } from "./session";
const { read, readOrder } = vi.hoisted(() => ({
  read: vi.fn(),
  readOrder: vi.fn(),
}));
vi.mock("../src/merchant/client", () => ({ merchantClient: () => ({ read }) }));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({ readOrder }),
}));
const modules = import.meta.glob("../convex/**/*.ts");
const seller = Keypair.generate();
const terms = (): PaymentTerms => ({
  merchant: seller.publicKey.toBase58(),
  reference: crypto.randomUUID().replaceAll("-", ""),
  title: "Design consultation",
  amount: "1000000",
  protectionSeconds: 86400,
  issuedAt: Date.now(),
});
const approved = (value: PaymentTerms) => ({
  terms: value,
  signature: bs58.encode(
    nacl.sign.detached(paymentApproval(value), seller.secretKey),
  ),
});

describe("merchant-approved payment links", () => {
  it("keeps the legacy public list usable while the new session API rolls out", async () => {
    const t = convexTest(schema, modules);
    const value = terms();
    const id = await t.mutation(internal.payments.insert, value);
    const oldClient = await t.query(api.payments.list, {
      merchant: value.merchant,
    });
    expect(oldClient).toEqual([await t.query(api.payments.get, { id })]);
    expect(
      await t.query(api.payments.list, {
        merchant: Keypair.generate().publicKey.toBase58(),
      }),
    ).toEqual([]);
    await expect(
      t.query(api.payments.listForSession, {
        session: "bad-token",
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Sign in again.");
  });
  it("creates only with wallet approval and keeps exact retries idempotent", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules),
      request = approved(terms());
    const id = await t.action(api.paymentActions.create, request);
    expect(await t.action(api.paymentActions.create, request)).toBe(id);
    const { token } = await signIn(t, seller);
    expect(
      (
        await t.query(api.payments.listForSession, {
          session: token,
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page,
    ).toHaveLength(1);
    expect((await t.query(api.payments.get, { id }))?.receipt).toBeUndefined();
  });
  it("only lists links for the signed-in wallet", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules);
    await t.action(api.paymentActions.create, approved(terms()));
    const stranger = Keypair.generate();
    const { token } = await signIn(t, stranger);
    expect(
      (
        await t.query(api.payments.listForSession, {
          session: token,
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page,
    ).toHaveLength(0);
    await expect(
      t.query(api.payments.listForSession, {
        session: "ff".repeat(32),
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Sign in again.");
    const { token: own } = await signIn(t, seller);
    expect(
      (
        await t.query(api.payments.listForSession, {
          session: own,
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page,
    ).toHaveLength(1);
  });
  it("rejects forged approvals, changed terms, and expired approvals", async () => {
    const t = convexTest(schema, modules),
      request = approved(terms());
    await expect(
      t.action(api.paymentActions.create, {
        ...request,
        terms: { ...request.terms, amount: "2000000" },
      }),
    ).rejects.toThrow("did not approve");
    await expect(
      t.action(api.paymentActions.create, {
        ...request,
        signature: bs58.encode(
          nacl.sign.detached(
            paymentApproval(request.terms),
            Keypair.generate().secretKey,
          ),
        ),
      }),
    ).rejects.toThrow("did not approve");
    await expect(
      t.action(
        api.paymentActions.create,
        approved({ ...terms(), issuedAt: Date.now() - 700_000 }),
      ),
    ).rejects.toThrow("expired");
    await expect(
      t.action(
        api.paymentActions.create,
        approved({ ...terms(), issuedAt: Date.now() + 60_000 }),
      ),
    ).rejects.toThrow("expired");
  });
  it("rejects unregistered merchants and reusing a reference with different signed terms", async () => {
    const t = convexTest(schema, modules),
      value = terms();
    read.mockResolvedValue({ ready: true, registered: false });
    await expect(
      t.action(api.paymentActions.create, approved(value)),
    ).rejects.toThrow("Register");
    read.mockResolvedValue({ ready: true, registered: true });
    await t.action(api.paymentActions.create, approved(value));
    await expect(
      t.action(
        api.paymentActions.create,
        approved({ ...value, title: "Changed" }),
      ),
    ).rejects.toThrow("already used");
  });
  it("rejects invalid amounts, references, titles and protection periods", () => {
    for (const overrides of [
      { amount: "0" },
      { amount: "01" },
      { amount: "10000000001" },
      { title: "" },
      { title: "bad\nmessage" },
      { title: "x".repeat(101) },
      { reference: "abc" },
      { protectionSeconds: 0 },
      { protectionSeconds: 604801 },
    ])
      expect(() => validateTerms({ ...terms(), ...overrides })).toThrow();
    expect(referenceBytes("ff".repeat(16))).toEqual(
      new Uint8Array(16).fill(255),
    );
  });
  it("treats malformed and unknown links as missing", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.payments.get, { id: "bad-id" })).toBeNull();
    await expect(
      t.action(api.paymentActions.sync, { id: "bad-id" }),
    ).rejects.toThrow("not found");
  });
  it("marks paid only after chain verification and does not regress resolved receipts", async () => {
    const t = convexTest(schema, modules),
      value = terms();
    const id = await t.mutation(internal.payments.insert, value);
    readOrder.mockResolvedValue(null);
    expect(await t.action(api.paymentActions.sync, { id })).toBe(false);
    expect((await t.query(api.payments.get, { id }))?.receipt).toBeUndefined();
    readOrder.mockRejectedValue(new Error("order does not match"));
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "does not match",
    );
    expect((await t.query(api.payments.get, { id }))?.receipt).toBeUndefined();
    const receipt = {
      order: "order",
      buyer: "buyer",
      reserveAmount: "50000",
      createdAt: 1000,
      expiresAt: 86401000,
      status: "paid" as const,
    };
    readOrder.mockResolvedValue(receipt);
    expect(await t.action(api.paymentActions.sync, { id })).toBe(true);
    expect((await t.query(api.payments.get, { id }))?.receipt).toEqual(receipt);
    await t.mutation(internal.payments.record, {
      id,
      receipt: { ...receipt, status: "completed" },
    });
    await t.action(api.paymentActions.sync, { id });
    expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
      "completed",
    );
  });
});

describe("payment link descriptions", () => {
  it("keeps the v1 approval message byte-for-byte without a description", () => {
    const value = terms();
    const message = new TextDecoder().decode(paymentApproval(value));
    expect(message).toBe(
      [
        "ReservePay payment link approval v1",
        "Network: Solana devnet (test tokens only)",
        `Merchant: ${value.merchant}`,
        `Reference: ${value.reference}`,
        `Title: ${value.title}`,
        `Amount (USDC base units): ${value.amount}`,
        `Protection (seconds): ${value.protectionSeconds}`,
        `Issued at (milliseconds): ${value.issuedAt}`,
        "Create this single-use payment link. This signature does not transfer funds.",
      ].join("\n"),
    );
  });
  it("creates a v2-signed link with a description and returns it", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules),
      value = { ...terms(), description: "Two logo concepts.\nOne revision." };
    const request = approved(value);
    const id = await t.action(api.paymentActions.create, request);
    expect(await t.action(api.paymentActions.create, request)).toBe(id);
    expect((await t.query(api.payments.get, { id }))?.description).toBe(
      value.description,
    );
  });
  it("rejects a description changed after signing", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules),
      request = approved({ ...terms(), description: "Original scope." });
    await expect(
      t.action(api.paymentActions.create, {
        ...request,
        terms: { ...request.terms, description: "Expanded scope." },
      }),
    ).rejects.toThrow("did not approve");
  });
  it("rejects a retry that drops or adds the description", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules),
      withDescription = terms();
    await t.mutation(internal.payments.insert, {
      ...withDescription,
      description: "Original scope.",
    });
    await expect(
      t.mutation(internal.payments.insert, withDescription),
    ).rejects.toThrow("already used");
    const withoutDescription = terms();
    await t.mutation(internal.payments.insert, withoutDescription);
    await expect(
      t.mutation(internal.payments.insert, {
        ...withoutDescription,
        description: "Added later.",
      }),
    ).rejects.toThrow("already used");
    // An exact retry, description included, still returns the same id.
    const exact = { ...terms(), description: "Same every time." };
    const id = await t.mutation(internal.payments.insert, exact);
    expect(await t.mutation(internal.payments.insert, exact)).toBe(id);
  });
  it("still verifies v1 links without a description", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules),
      request = approved(terms());
    const id = await t.action(api.paymentActions.create, request);
    expect((await t.query(api.payments.get, { id }))?.description).toBeUndefined();
  });
  it("validates description length, control characters and empty values", () => {
    expect(() =>
      validateTerms({ ...terms(), description: "x".repeat(501) }),
    ).toThrow();
    expect(() =>
      validateTerms({ ...terms(), description: "bad\tdescription" }),
    ).toThrow();
    expect(() =>
      validateTerms({ ...terms(), description: "bad\rdescription" }),
    ).toThrow();
    expect(() => validateTerms({ ...terms(), description: "" })).toThrow();
    expect(() => validateTerms({ ...terms(), description: "  " })).toThrow();
    expect(() => validateTerms({ ...terms(), description: " padded " })).toThrow();
    expect(() =>
      validateTerms({ ...terms(), description: "line one\nline two" }),
    ).not.toThrow();
    expect(() => validateTerms(terms())).not.toThrow();
  });
});

describe("deactivating payment links", () => {
  it("lets the owner deactivate and reactivate an unpaid link", async () => {
    readOrder.mockResolvedValue(null);
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, terms());
    const { token } = await signIn(t, seller);
    await t.action(api.paymentActions.deactivate, { session: token, id });
    const deactivated = await t.query(api.payments.get, { id });
    expect(deactivated?.deactivatedAt).toBeGreaterThan(0);
    // Deactivating twice is a no-op.
    await t.action(api.paymentActions.deactivate, { session: token, id });
    expect((await t.query(api.payments.get, { id }))?.deactivatedAt).toBe(
      deactivated?.deactivatedAt,
    );
    await t.mutation(api.payments.reactivate, { session: token, id });
    expect(
      (await t.query(api.payments.get, { id }))?.deactivatedAt,
    ).toBeUndefined();
  });
  it("never reveals another merchant's link", async () => {
    readOrder.mockResolvedValue(null);
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, terms());
    const { token } = await signIn(t, Keypair.generate());
    await expect(
      t.action(api.paymentActions.deactivate, { session: token, id }),
    ).rejects.toThrow("not found");
    await expect(
      t.mutation(api.payments.reactivate, { session: token, id }),
    ).rejects.toThrow("not found");
    await expect(
      t.action(api.paymentActions.deactivate, { session: "bad-token", id }),
    ).rejects.toThrow("Sign in again.");
  });
  it("refuses to deactivate a link paid at confirmed but not yet finalized", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, terms());
    const { token } = await signIn(t, seller);
    // The buyer paid seconds ago: visible at confirmed, not yet finalized, so
    // sync has not recorded a receipt.
    readOrder.mockReset();
    readOrder.mockImplementation(async (_link, commitment) =>
      commitment === "confirmed"
        ? {
            order: "order",
            buyer: "buyer",
            reserveAmount: "50000",
            createdAt: 1000,
            expiresAt: 86401000,
            status: "paid" as const,
          }
        : null,
    );
    await expect(
      t.action(api.paymentActions.deactivate, { session: token, id }),
    ).rejects.toThrow("just paid");
    expect(readOrder).toHaveBeenCalledWith(
      expect.objectContaining({ reference: expect.any(String) }),
      "confirmed",
    );
    const link = await t.query(api.payments.get, { id });
    // Receipts are still only recorded at finalized, by sync.
    expect(link?.receipt).toBeUndefined();
    expect(link?.deactivatedAt).toBeUndefined();
  });
  it("fails closed when the chain cannot be read", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, terms());
    const { token } = await signIn(t, seller);
    readOrder.mockReset();
    readOrder.mockRejectedValue(new Error("RPC unavailable"));
    await expect(
      t.action(api.paymentActions.deactivate, { session: token, id }),
    ).rejects.toThrow();
    expect((await t.query(api.payments.get, { id }))?.deactivatedAt).toBeUndefined();
  });
  it("authorizes before reading the chain", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, terms());
    const { token } = await signIn(t, Keypair.generate());
    readOrder.mockReset();
    await expect(
      t.action(api.paymentActions.deactivate, { session: "bad-token", id }),
    ).rejects.toThrow("Sign in again.");
    await expect(
      t.action(api.paymentActions.deactivate, { session: token, id }),
    ).rejects.toThrow("not found");
    expect(readOrder).not.toHaveBeenCalled();
  });
  it("refuses to deactivate a paid link but still records its receipt", async () => {
    readOrder.mockResolvedValue(null);
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, terms());
    const { token } = await signIn(t, seller);
    const receipt = {
      order: "order",
      buyer: "buyer",
      reserveAmount: "50000",
      createdAt: 1000,
      expiresAt: 86401000,
      status: "paid" as const,
    };
    await t.action(api.paymentActions.deactivate, { session: token, id });
    // A buyer can still pay a stale tab; moved funds must get their receipt.
    await t.mutation(internal.payments.record, { id, receipt });
    expect((await t.query(api.payments.get, { id }))?.receipt).toEqual(receipt);
    await expect(
      t.action(api.paymentActions.deactivate, { session: token, id }),
    ).rejects.toThrow("already been paid");
    await expect(
      t.mutation(api.payments.reactivate, { session: token, id }),
    ).rejects.toThrow("already been paid");
  });
});

describe("paginated link history", () => {
  it("pages newest-first without duplicates", async () => {
    const t = convexTest(schema, modules);
    // Seed directly: the creation rate limit is exercised elsewhere.
    const references: string[] = [];
    for (let index = 0; index < 25; index++) {
      const value = terms();
      references.push(value.reference);
      await t.run((ctx) => ctx.db.insert("paymentLinks", value));
    }
    const { token } = await signIn(t, seller);
    const first = await t.query(api.payments.listForSession, {
      session: token,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(first.page).toHaveLength(20);
    expect(first.isDone).toBe(false);
    const rest = await t.query(api.payments.listForSession, {
      session: token,
      paginationOpts: { numItems: 20, cursor: first.continueCursor },
    });
    expect(rest.page).toHaveLength(5);
    expect(rest.isDone).toBe(true);
    const page = [...first.page, ...rest.page];
    expect(new Set(page.map((link) => link._id)).size).toBe(25);
    expect(page.map((link) => link.reference)).toEqual(
      [...references].reverse(),
    );
  });
});

describe("titles for protected orders", () => {
  it("resolves this merchant's references at any age", async () => {
    const t = convexTest(schema, modules);
    const own = { ...terms(), description: "Scope of work." };
    const otherMerchant = Keypair.generate().publicKey.toBase58();
    const foreign = { ...terms(), merchant: otherMerchant };
    await t.run(async (ctx) => {
      await ctx.db.insert("paymentLinks", own);
      await ctx.db.insert("paymentLinks", foreign);
    });
    const { token } = await signIn(t, seller);
    const titles = await t.query(api.payments.titlesForReferences, {
      session: token,
      references: [own.reference, foreign.reference, "ab".repeat(16)],
    });
    expect(titles).toEqual({
      [own.reference]: { title: own.title, description: own.description },
    });
  });
  it("rejects oversized and malformed requests", async () => {
    const t = convexTest(schema, modules);
    const { token } = await signIn(t, seller);
    await expect(
      t.query(api.payments.titlesForReferences, {
        session: token,
        references: Array.from({ length: 101 }, () => "ab".repeat(16)),
      }),
    ).rejects.toThrow("At most 100");
    await expect(
      t.query(api.payments.titlesForReferences, {
        session: token,
        references: ["not-a-reference"],
      }),
    ).rejects.toThrow("Invalid payment reference.");
    await expect(
      t.query(api.payments.titlesForReferences, {
        session: "bad-token",
        references: [],
      }),
    ).rejects.toThrow("Sign in again.");
  });
});
