import { Program, type IdlAccounts } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  type AccountInfo,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  PROGRAM_ID,
  merchantAddress,
  orderAddress,
  protocolAddress,
  calculateSettlement,
} from "@reservepay/core";
import { DEVNET_USDC, merchantClient } from "../merchant/client";
import type { Reservepay } from "../merchant/reservepay";
import idl from "../merchant/reservepay.json";
import { referenceBytes, validateTerms, type PaymentTerms } from "./terms";
import { orderStatus, type OrderStatus } from "./order-status";
import { withRetry } from "../lib/retry";

// Byte offset of the 1-byte status enum inside a serialized Order account:
// 8 discriminator + 32 merchant + 32 buyer + 32 buyer_token_account
// + 16 reference + 4×8 (amount, reserve, created_at, expires_at).
// Open = 0 (programs/reservepay/src/lib.rs).
export const ORDER_STATUS_OFFSET = 152;

export type OrderReceipt = {
  order: string;
  buyer: string;
  reserveAmount: string;
  createdAt: number;
  expiresAt: number;
  status: OrderStatus;
};

export async function readChainTime(rpc: Connection): Promise<bigint> {
  const clock = await rpc.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "confirmed");
  if (!clock) throw new Error("Could not read the Solana clock.");
  return clock.data.readBigInt64LE(32);
}

// Shared by the resolver/merchant resolution flow (createAta: true, the
// signer pays any rent) and the keeper (createAta: false, it never pays rent).
export async function completeOrderInstructions(
  rpc: Connection,
  {
    order,
    merchantPda,
    authority,
    mint,
    caller,
    createAta,
  }: {
    order: PublicKey;
    merchantPda: PublicKey;
    authority: PublicKey;
    mint: PublicKey;
    caller: PublicKey;
    createAta: boolean;
  },
): Promise<TransactionInstruction[]> {
  const program = new Program<Reservepay>(idl as Reservepay, {
    connection: rpc,
  });
  const merchantTokenAccount = getAssociatedTokenAddressSync(mint, authority);
  const instructions: TransactionInstruction[] = [];
  if (createAta)
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        caller,
        merchantTokenAccount,
        authority,
        mint,
      ),
    );
  instructions.push(
    await program.methods
      .completeOrder()
      .accountsStrict({
        protocol: protocolAddress(),
        merchant: merchantPda,
        order,
        reserveVault: getAssociatedTokenAddressSync(mint, merchantPda, true),
        merchantTokenAccount,
        caller,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  );
  return instructions;
}

export function paymentClient(rpc: Connection, mint = DEVNET_USDC) {
  const program = new Program<Reservepay>(idl as Reservepay, {
    connection: rpc,
  });
  const addresses = (terms: PaymentTerms) => {
    validateTerms(terms);
    const authority = new PublicKey(terms.merchant);
    const merchant = merchantAddress(authority, mint);
    return {
      authority,
      merchant,
      order: orderAddress(merchant, referenceBytes(terms.reference)),
      reserveVault: getAssociatedTokenAddressSync(mint, merchant, true),
      merchantTokenAccount: getAssociatedTokenAddressSync(mint, authority),
    };
  };
  // Owner, merchant, reference, amount and window validation shared by the
  // single and batched reads; throws the same "does not match" error.
  const decodeState = (
    terms: PaymentTerms,
    account: AccountInfo<Buffer> | null,
  ) => {
    if (!account) return null;
    if (!account.owner.equals(PROGRAM_ID))
      throw new Error("Unexpected order account owner.");
    const state = program.coder.accounts.decode<
      IdlAccounts<Reservepay>["order"]
    >("order", account.data);
    if (
      !state.merchant.equals(addresses(terms).merchant) ||
      !Buffer.from(state.reference).equals(
        Buffer.from(referenceBytes(terms.reference)),
      ) ||
      state.amount.toString() !== terms.amount ||
      !state.expiresAt
        .sub(state.createdAt)
        .eq(new BN(terms.protectionSeconds))
    )
      throw new Error(
        "The on-chain order does not match this payment link. Do not send another payment.",
      );
    return state;
  };
  const toReceipt = (
    terms: PaymentTerms,
    state: NonNullable<ReturnType<typeof decodeState>>,
  ): OrderReceipt => ({
    order: addresses(terms).order.toBase58(),
    buyer: state.buyer.toBase58(),
    reserveAmount: state.reserveAmount.toString(),
    createdAt: state.createdAt.toNumber() * 1000,
    expiresAt: state.expiresAt.toNumber() * 1000,
    status: orderStatus(state.status),
  });
  const decodeOrder = (
    terms: PaymentTerms,
    account: AccountInfo<Buffer> | null,
  ): OrderReceipt | null => {
    const state = decodeState(terms, account);
    return state ? toReceipt(terms, state) : null;
  };
  return {
    addresses,
    async readState(
      terms: PaymentTerms,
      commitment: "confirmed" | "finalized" = "finalized",
    ) {
      const { order } = addresses(terms);
      const account = await withRetry(() =>
        rpc.getAccountInfo(order, commitment),
      );
      return decodeState(terms, account);
    },
    async readOrder(
      terms: PaymentTerms,
      commitment: "confirmed" | "finalized" = "finalized",
    ) {
      const state = await this.readState(terms, commitment);
      return state ? toReceipt(terms, state) : null;
    },
    // Batched reads for the reconciler: 100 accounts per RPC call, each
    // chunk retried. A link whose order does not match gets an Error entry
    // so one bad order never fails the batch; a failed chunk rejects the
    // call so the caller can retry the same page next run.
    async readOrders(
      items: { id: string; terms: PaymentTerms }[],
      commitment: "confirmed" | "finalized" = "finalized",
    ): Promise<Map<string, OrderReceipt | null | Error>> {
      const results = new Map<string, OrderReceipt | null | Error>();
      for (let start = 0; start < items.length; start += 100) {
        const chunk = items.slice(start, start + 100);
        const accounts = await withRetry(() =>
          rpc.getMultipleAccountsInfo(
            chunk.map(({ terms }) => addresses(terms).order),
            commitment,
          ),
        );
        chunk.forEach(({ id, terms }, index) => {
          try {
            results.set(id, decodeOrder(terms, accounts[index]));
          } catch (error) {
            results.set(
              id,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        });
      }
      return results;
    },
    async readResolver() {
      const account = await rpc.getAccountInfo(protocolAddress(), "confirmed");
      if (!account || !account.owner.equals(PROGRAM_ID))
        throw new Error("Could not verify the protocol resolver.");
      return program.coder.accounts.decode<IdlAccounts<Reservepay>["protocol"]>(
        "protocol",
        account.data,
      ).resolver;
    },
    async prepareResolution(
      terms: PaymentTerms,
      signer: PublicKey,
      action: "refund" | "complete",
    ) {
      const { authority, merchant, order, reserveVault, merchantTokenAccount } =
        addresses(terms);
      const [state, resolver] = await Promise.all([
        this.readState(terms, "confirmed"),
        this.readResolver(),
      ]);
      if (!state || !("open" in state.status))
        throw new Error("This order is already resolved or has not been paid.");
      if (action === "refund" && !signer.equals(resolver))
        throw new Error("Only the configured resolver can refund an order.");
      if (action === "complete" && !signer.equals(resolver)) {
        if (!signer.equals(authority))
          throw new Error(
            "Connect the merchant or resolver wallet to complete this order.",
          );
        if ((await readChainTime(rpc)) < BigInt(state.expiresAt.toString()))
          throw new Error(
            "Protection has not ended. Only the resolver can complete this order early.",
          );
      }
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
      );
      if (action === "refund") {
        if (
          state.buyerTokenAccount.equals(
            getAssociatedTokenAddressSync(mint, state.buyer),
          )
        )
          transaction.add(
            createAssociatedTokenAccountIdempotentInstruction(
              signer,
              state.buyerTokenAccount,
              state.buyer,
              mint,
            ),
          );
        transaction.add(
          await program.methods
            .refundOrder()
            .accountsStrict({
              protocol: protocolAddress(),
              merchant,
              order,
              reserveVault,
              buyerTokenAccount: state.buyerTokenAccount,
              resolver: signer,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction(),
        );
      } else {
        transaction.add(
          ...(await completeOrderInstructions(rpc, {
            order,
            merchantPda: merchant,
            authority,
            mint,
            caller: signer,
            createAta: true,
          })),
        );
      }
      const lifetime = await rpc.getLatestBlockhash("confirmed");
      transaction.feePayer = signer;
      transaction.recentBlockhash = lifetime.blockhash;
      const fee = await rpc.getFeeForMessage(
        transaction.compileMessage(),
        "confirmed",
      );
      const destination =
        action === "complete" ? merchantTokenAccount : state.buyerTokenAccount;
      const rent = !(await rpc.getAccountInfo(destination))
        ? await rpc.getMinimumBalanceForRentExemption(165)
        : 0;
      if (
        (await rpc.getBalance(signer, "confirmed")) <
        rent + (fee.value ?? 5200)
      )
        throw new Error(
          "Add devnet SOL to cover the network fee and any token account rent.",
        );
      return { transaction, ...lifetime };
    },
    async prepare(terms: PaymentTerms, buyer: PublicKey) {
      const { authority, merchant, order, reserveVault, merchantTokenAccount } =
        addresses(terms);
      if (authority.equals(buyer))
        throw new Error("Use a different wallet to pay your own link.");
      if (await this.readOrder(terms, "confirmed"))
        throw new Error("This payment link has already been paid.");
      const accounts = merchantClient(rpc, mint);
      const [seller, customer] = await Promise.all([
        accounts.read(authority),
        accounts.read(buyer),
      ]);
      if (!seller.ready || !seller.registered)
        throw new Error("This merchant is not ready to receive payments.");
      const amount = BigInt(terms.amount);
      const settlement = calculateSettlement(amount, seller.reserveBps);
      if (seller.reserve + settlement.reserveAmount < seller.locked + amount)
        throw new Error(
          "The merchant needs to add reserve funds before this payment can be protected.",
        );
      if (customer.walletBalance < amount)
        throw new Error("Your wallet does not have enough devnet USDC.");
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
        createAssociatedTokenAccountIdempotentInstruction(
          buyer,
          merchantTokenAccount,
          authority,
          mint,
        ),
        await program.methods
          .createOrder(
            Array.from(referenceBytes(terms.reference)),
            new BN(terms.amount),
            new BN(terms.protectionSeconds),
          )
          .accountsStrict({
            protocol: protocolAddress(),
            merchant,
            order,
            buyerTokenAccount: getAssociatedTokenAddressSync(mint, buyer),
            merchantTokenAccount,
            reserveVault,
            mint,
            buyer,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
      const lifetime = await rpc.getLatestBlockhash("confirmed");
      transaction.feePayer = buyer;
      transaction.recentBlockhash = lifetime.blockhash;
      const fee = await rpc.getFeeForMessage(
        transaction.compileMessage(),
        "confirmed",
      );
      const rent =
        (await rpc.getMinimumBalanceForRentExemption(154)) +
        ((await rpc.getAccountInfo(merchantTokenAccount))
          ? 0
          : await rpc.getMinimumBalanceForRentExemption(165));
      if (customer.lamports < rent + (fee.value ?? 5250))
        throw new Error(
          "Add devnet SOL to cover the network fee and order account rent.",
        );
      return { transaction, ...lifetime };
    },
  };
}
