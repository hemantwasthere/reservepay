import { paymentClient } from "../apps/web/src/payments/chain";
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { merchantClient } from "../apps/web/src/merchant/client";
import { validateSignedTransaction } from "../apps/web/src/merchant/transactions";
import { Reservepay } from "../target/types/reservepay";

describe("reservepay", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const workspaceProgram = anchor.workspace
    .Reservepay as anchor.Program<Reservepay>;
  const payer = (provider.wallet as anchor.Wallet & { payer: Keypair }).payer;
  const buyer = Keypair.generate();
  let mint: PublicKey;
  let merchant: PublicKey;
  let reserveVault: PublicKey;
  let merchantTokenAccount: PublicKey;
  let buyerTokenAccount: PublicKey;

  before(async () => {
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
    );
    merchant = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), payer.publicKey.toBuffer(), mint.toBuffer()],
      workspaceProgram.programId,
    )[0];
    reserveVault = getAssociatedTokenAddressSync(mint, merchant, true);
    merchantTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        payer.publicKey,
      )
    ).address;
    buyerTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        buyer.publicKey,
      )
    ).address;
    await mintTo(
      provider.connection,
      payer,
      mint,
      merchantTokenAccount,
      payer,
      200_000_000,
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      buyerTokenAccount,
      payer,
      300_000_000,
    );
  });

  it("initializes a fully covered merchant reserve", async () => {
    const protocol = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      workspaceProgram.programId,
    )[0];

    await workspaceProgram.methods
      .initializeProtocol(payer.publicKey, 500)
      .accountsStrict({
        protocol,
        authority: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await workspaceProgram.methods
      .registerMerchant()
      .accountsStrict({
        protocol,
        merchant,
        reserveVault,
        mint,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await workspaceProgram.methods
      .fundReserve(new anchor.BN(190_000_000))
      .accountsStrict({
        merchant,
        source: merchantTokenAccount,
        reserveVault,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const reserve = await getAccount(provider.connection, reserveVault);
    const merchantState =
      await workspaceProgram.account.merchant.fetch(merchant);
    expect(reserve.amount).to.equal(190_000_000n);
    expect(merchantState.reserveBps).to.equal(500);
    expect(merchantState.lockedLiability.toNumber()).to.equal(0);
  });

  it("pays the merchant immediately and refunds the buyer in full", async () => {
    const protocol = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      workspaceProgram.programId,
    )[0];
    const reference = Array.from(Buffer.from("refund-order-001"));
    const order = PublicKey.findProgramAddressSync(
      [Buffer.from("order"), merchant.toBuffer(), Buffer.from(reference)],
      workspaceProgram.programId,
    )[0];

    await workspaceProgram.methods
      .createOrder(reference, new anchor.BN(100_000_000), new anchor.BN(3_600))
      .accountsStrict({
        protocol,
        merchant,
        order,
        buyerTokenAccount,
        merchantTokenAccount,
        reserveVault,
        mint,
        buyer: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const buyerAfterPayment = await getAccount(
      provider.connection,
      buyerTokenAccount,
    );
    const merchantAfterPayment = await getAccount(
      provider.connection,
      merchantTokenAccount,
    );
    expect(buyerAfterPayment.amount).to.equal(200_000_000n);
    expect(merchantAfterPayment.amount).to.equal(105_000_000n);

    let blocked = false;
    try {
      await workspaceProgram.methods
        .withdrawReserve(new anchor.BN(96_000_000))
        .accountsStrict({
          merchant,
          reserveVault,
          destination: merchantTokenAccount,
          authority: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch {
      blocked = true;
    }
    expect(blocked).to.equal(true);

    await workspaceProgram.methods
      .refundOrder()
      .accountsStrict({
        protocol,
        merchant,
        order,
        reserveVault,
        buyerTokenAccount,
        resolver: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const buyerAfterRefund = await getAccount(
      provider.connection,
      buyerTokenAccount,
    );
    const orderState = await workspaceProgram.account.order.fetch(order);
    expect(buyerAfterRefund.amount).to.equal(300_000_000n);
    expect(orderState.status).to.deep.equal({ refunded: {} });
  });

  it("releases clean orders and lets merchants withdraw surplus", async () => {
    const protocol = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      workspaceProgram.programId,
    )[0];
    const reference = Array.from(Buffer.from("settle-order-001"));
    const order = PublicKey.findProgramAddressSync(
      [Buffer.from("order"), merchant.toBuffer(), Buffer.from(reference)],
      workspaceProgram.programId,
    )[0];

    await workspaceProgram.methods
      .createOrder(reference, new anchor.BN(100_000_000), new anchor.BN(3_600))
      .accountsStrict({
        protocol,
        merchant,
        order,
        buyerTokenAccount,
        merchantTokenAccount,
        reserveVault,
        mint,
        buyer: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    await workspaceProgram.methods
      .completeOrder()
      .accountsStrict({
        protocol,
        merchant,
        order,
        reserveVault,
        merchantTokenAccount,
        caller: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await workspaceProgram.methods
      .withdrawReserve(new anchor.BN(95_000_000))
      .accountsStrict({
        merchant,
        reserveVault,
        destination: merchantTokenAccount,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const reserve = await getAccount(provider.connection, reserveVault);
    const merchantState =
      await workspaceProgram.account.merchant.fetch(merchant);
    const merchantBalance = await getAccount(
      provider.connection,
      merchantTokenAccount,
    );
    expect(reserve.amount).to.equal(0n);
    expect(merchantBalance.amount).to.equal(300_000_000n);
    expect(merchantState.lockedLiability.toNumber()).to.equal(0);
    expect(merchantState.totalVolume.toNumber()).to.equal(200_000_000);
    expect(merchantState.completedOrders.toNumber()).to.equal(1);
    expect(merchantState.refundedOrders.toNumber()).to.equal(1);
  });
  it("registers, funds and withdraws using the dashboard transaction client", async () => {
    const client = merchantClient(provider.connection, mint);
    const before = await client.read(buyer.publicKey);
    expect(before.ready).to.equal(true);
    expect(before.registered).to.equal(false);
    const transact = async (
      action: "register" | "fund" | "withdraw",
      amount = 0n,
    ) => {
      const prepared = await client.prepare(buyer.publicKey, action, amount);
      const original = anchor.web3.Transaction.from(
        prepared.transaction.serialize({ requireAllSignatures: false }),
      );
      prepared.transaction.sign(buyer);
      const signed = validateSignedTransaction(
        original,
        prepared.transaction.serialize(),
      );
      const signature = await provider.connection.sendRawTransaction(
        signed.bytes,
      );
      expect(signature).to.equal(signed.signature);
      const confirmation = await provider.connection.confirmTransaction(
        {
          signature,
          blockhash: prepared.blockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        },
        "confirmed",
      );
      expect(confirmation.value.err).to.equal(null);
    };
    await transact("register");
    expect((await client.read(buyer.publicKey)).registered).to.equal(true);
    await transact("fund", 25_000_000n);
    expect((await client.read(buyer.publicKey)).reserve).to.equal(25_000_000n);
    await transact("withdraw", 10_000_000n);
    const after = await client.read(buyer.publicKey);
    expect(after.reserve).to.equal(15_000_000n);
    expect(after.walletBalance).to.equal(before.walletBalance - 15_000_000n);
    expect(after.locked).to.equal(0n);
    let rejected = false;
    try {
      await client.prepare(buyer.publicKey, "withdraw", 16_000_000n);
    } catch {
      rejected = true;
    }
    expect(rejected).to.equal(true);
  });
  it("pays a single-use checkout through the browser client and verifies the receipt", async () => {
    // The previous test leaves this merchant with 15 USDC collateral.
    const client = paymentClient(provider.connection, mint);
    const terms = {
      merchant: buyer.publicKey.toBase58(),
      reference: "ce".repeat(16),
      title: "Checkout integration",
      amount: "10000000",
      protectionSeconds: 86400,
      issuedAt: Date.now(),
    };
    const before = await merchantClient(provider.connection, mint).read(
      buyer.publicKey,
    );
    const payerBefore = await getAccount(
      provider.connection,
      merchantTokenAccount,
    );
    const prepared = await client.prepare(terms, payer.publicKey);
    prepared.transaction.sign(payer);
    const signed = validateSignedTransaction(
      prepared.transaction,
      prepared.transaction.serialize(),
    );
    const signature = await provider.connection.sendRawTransaction(
      signed.bytes,
    );
    const confirmation = await provider.connection.confirmTransaction(
      {
        signature,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
      },
      "confirmed",
    );
    expect(confirmation.value.err).to.equal(null);
    const receipt = await client.readOrder(terms, "confirmed");
    expect(receipt?.buyer).to.equal(payer.publicKey.toBase58());
    expect(receipt?.reserveAmount).to.equal("500000");
    expect(receipt?.status).to.equal("paid");
    expect(receipt!.expiresAt - receipt!.createdAt).to.equal(86400000);
    const after = await merchantClient(provider.connection, mint).read(
      buyer.publicKey,
    );
    expect(after.reserve - before.reserve).to.equal(500000n);
    expect(after.walletBalance - before.walletBalance).to.equal(9500000n);
    expect(after.locked - before.locked).to.equal(10000000n);
    expect(
      payerBefore.amount -
        (await getAccount(provider.connection, merchantTokenAccount)).amount,
    ).to.equal(10000000n);
    let rejected = false;
    try {
      await client.prepare(terms, payer.publicKey);
    } catch (error) {
      rejected = String(error).includes("already been paid");
    }
    expect(rejected).to.equal(true);
    expect(
      (await merchantClient(provider.connection, mint).read(buyer.publicKey))
        .locked,
    ).to.equal(after.locked);
  });
});
