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
  it("creates only with wallet approval and keeps exact retries idempotent", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules),
      request = approved(terms());
    const id = await t.action(api.paymentActions.create, request);
    expect(await t.action(api.paymentActions.create, request)).toBe(id);
    const { token } = await signIn(t, seller);
    expect(await t.query(api.payments.list, { session: token })).toHaveLength(1);
    expect((await t.query(api.payments.get, { id }))?.receipt).toBeUndefined();
  });
  it("only lists links for the signed-in wallet", async () => {
    read.mockResolvedValue({ ready: true, registered: true });
    const t = convexTest(schema, modules);
    await t.action(api.paymentActions.create, approved(terms()));
    const stranger = Keypair.generate();
    const { token } = await signIn(t, stranger);
    expect(await t.query(api.payments.list, { session: token })).toHaveLength(0);
    await expect(
      t.query(api.payments.list, { session: "ff".repeat(32) }),
    ).rejects.toThrow("Sign in again.");
    const { token: own } = await signIn(t, seller);
    expect(await t.query(api.payments.list, { session: own })).toHaveLength(1);
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
