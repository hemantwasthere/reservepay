import { Program, type IdlAccounts } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
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
import { orderStatus } from "./order-status";

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
  return {
    addresses,
    async readOrder(
      terms: PaymentTerms,
      commitment: "confirmed" | "finalized" = "finalized",
    ) {
      const { merchant, order } = addresses(terms);
      const account = await rpc.getAccountInfo(order, commitment);
      if (!account) return null;
      if (!account.owner.equals(PROGRAM_ID))
        throw new Error("Unexpected order account owner.");
      const state = program.coder.accounts.decode<
        IdlAccounts<Reservepay>["order"]
      >("order", account.data);
      if (
        !state.merchant.equals(merchant) ||
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
      const status = orderStatus(state.status);
      return {
        order: order.toBase58(),
        buyer: state.buyer.toBase58(),
        reserveAmount: state.reserveAmount.toString(),
        createdAt: state.createdAt.toNumber() * 1000,
        expiresAt: state.expiresAt.toNumber() * 1000,
        status,
      };
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
