import { Program, type IdlAccounts } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { PROGRAM_ID, merchantAddress, protocolAddress } from "@reservepay/core";
import type { Reservepay } from "./reservepay";
import idl from "./reservepay.json";
import { orderStatus, type OrderStatus } from "../payments/order-status";

export const DEVNET_USDC = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
export const connection = new Connection("https://api.devnet.solana.com", {
  commitment: "confirmed",
  disableRetryOnRateLimit: true,
});
export { PROGRAM_ID };
export type ReserveAction = "register" | "fund" | "withdraw";
export type MerchantState = {
  ready: boolean;
  registered: boolean;
  merchant: string;
  vault: string;
  reserveBps: number;
  reserve: bigint;
  locked: bigint;
  walletBalance: bigint;
  lamports: number;
  completedOrders: bigint;
  refundedOrders: bigint;
  volume: bigint;
  slot: number;
};
export type MerchantOrder = {
  address: string;
  reference: string;
  buyer: string;
  amount: bigint;
  reserveAmount: bigint;
  createdAt: number;
  expiresAt: number;
  status: OrderStatus;
};

export function parseAmount(value: string): bigint {
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(value))
    throw new Error("Enter a positive USDC amount with up to 6 decimals.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0n || amount > 18_446_744_073_709_551_615n)
    throw new Error("This amount is outside the supported range.");
  return amount;
}

export function exactAmount(amount: bigint): string {
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${amount / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export function merchantClient(
  rpc: Connection = connection,
  mint: PublicKey = DEVNET_USDC,
) {
  const program = new Program<Reservepay>(idl as Reservepay, {
    connection: rpc,
  });
  const addresses = (authority: PublicKey) => {
    const merchant = merchantAddress(authority, mint);
    return {
      merchant,
      reserveVault: getAssociatedTokenAddressSync(mint, merchant, true),
      tokenAccount: getAssociatedTokenAddressSync(mint, authority),
    };
  };
  return {
    async read(authority: PublicKey): Promise<MerchantState> {
      const { merchant, reserveVault, tokenAccount } = addresses(authority);
      const {
        value: [deployed, protocol, account, vault, token, wallet],
        context,
      } = await rpc.getMultipleAccountsInfoAndContext([
        PROGRAM_ID,
        protocolAddress(),
        merchant,
        reserveVault,
        tokenAccount,
        authority,
      ]);
      const decode = <T extends "merchant" | "protocol">(
        name: T,
        info: NonNullable<typeof account>,
      ) => {
        if (!info.owner.equals(PROGRAM_ID))
          throw new Error("Unexpected reserve account owner.");
        return program.coder.accounts.decode<IdlAccounts<Reservepay>[T]>(
          name,
          info.data,
        );
      };
      const settings = protocol ? decode("protocol", protocol) : null;
      const state = account ? decode("merchant", account) : null;
      if (
        state &&
        (!state.authority.equals(authority) ||
          !state.mint.equals(mint) ||
          !state.reserveVault.equals(reserveVault))
      )
        throw new Error("Merchant account does not match this wallet.");
      const balance = (
        address: PublicKey,
        info: typeof vault,
        owner: PublicKey,
      ) => {
        if (!info) return 0n;
        const token = unpackAccount(address, info);
        if (!token.mint.equals(mint) || !token.owner.equals(owner))
          throw new Error("Unexpected token account.");
        return token.amount;
      };
      if (state && !vault)
        throw new Error("The merchant reserve vault is missing.");
      return {
        ready: Boolean(deployed?.executable && settings),
        registered: Boolean(state),
        merchant: merchant.toBase58(),
        vault: reserveVault.toBase58(),
        reserveBps: state?.reserveBps ?? settings?.defaultReserveBps ?? 500,
        reserve: balance(reserveVault, vault, merchant),
        locked: BigInt(state?.lockedLiability.toString() ?? "0"),
        walletBalance: balance(tokenAccount, token, authority),
        lamports: wallet?.lamports ?? 0,
        completedOrders: BigInt(state?.completedOrders.toString() ?? "0"),
        refundedOrders: BigInt(state?.refundedOrders.toString() ?? "0"),
        volume: BigInt(state?.totalVolume.toString() ?? "0"),
        slot: context.slot,
      };
    },
    async readOrders(
      authority: PublicKey,
      locked?: bigint,
    ): Promise<{ orders: MerchantOrder[]; mismatch: boolean }> {
      const { merchant } = addresses(authority);
      // `merchant` is the first field after the 8-byte order discriminator.
      const accounts = await program.account.order.all([
        { memcmp: { offset: 8, bytes: merchant.toBase58() } },
      ]);
      const orders: MerchantOrder[] = accounts.map(({ publicKey, account }) => ({
        address: publicKey.toBase58(),
        reference: Buffer.from(account.reference).toString("hex"),
        buyer: account.buyer.toBase58(),
        amount: BigInt(account.amount.toString()),
        reserveAmount: BigInt(account.reserveAmount.toString()),
        createdAt: account.createdAt.toNumber() * 1000,
        expiresAt: account.expiresAt.toNumber() * 1000,
        status: orderStatus(account.status),
      }));
      orders.sort(
        (a, b) =>
          (a.status === "paid" ? 0 : 1) - (b.status === "paid" ? 0 : 1) ||
          a.expiresAt - b.expiresAt,
      );
      const openTotal = orders.reduce(
        (sum, order) => (order.status === "paid" ? sum + order.amount : sum),
        0n,
      );
      return { orders, mismatch: locked !== undefined && openTotal !== locked };
    },
    async prepare(authority: PublicKey, action: ReserveAction, amount = 0n) {
      const state = await this.read(authority);
      if (!state.ready)
        throw new Error(
          "The ReservePay devnet program is not ready yet. Please try again later.",
        );
      if (action === "register" && state.registered)
        throw new Error(
          "This merchant is already registered. Refresh your balances.",
        );
      if (action !== "register" && !state.registered)
        throw new Error("Register your merchant account first.");
      if (
        action !== "register" &&
        (amount <= 0n || amount > 18_446_744_073_709_551_615n)
      )
        throw new Error("Enter a valid amount.");
      if (action === "fund" && amount > state.walletBalance)
        throw new Error("Your wallet does not have enough devnet USDC.");
      if (action === "withdraw" && amount > state.reserve - state.locked)
        throw new Error(
          "This amount is backing open orders and cannot be withdrawn.",
        );
      const { merchant, reserveVault, tokenAccount } = addresses(authority);
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
      );
      if (action === "register") {
        transaction.add(
          await program.methods
            .registerMerchant()
            .accountsStrict({
              protocol: protocolAddress(),
              merchant,
              reserveVault,
              mint,
              authority,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        );
      } else if (action === "fund") {
        transaction.add(
          await program.methods
            .fundReserve(new BN(amount.toString()))
            .accountsStrict({
              merchant,
              reserveVault,
              source: tokenAccount,
              authority,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction(),
        );
      } else {
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            authority,
            tokenAccount,
            authority,
            mint,
          ),
        );
        transaction.add(
          await program.methods
            .withdrawReserve(new BN(amount.toString()))
            .accountsStrict({
              merchant,
              reserveVault,
              destination: tokenAccount,
              authority,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction(),
        );
      }
      const lifetime = await rpc.getLatestBlockhash("confirmed");
      transaction.feePayer = authority;
      transaction.recentBlockhash = lifetime.blockhash;
      const fee = await rpc.getFeeForMessage(
        transaction.compileMessage(),
        "confirmed",
      );
      const rent =
        action === "register"
          ? (await rpc.getMinimumBalanceForRentExemption(139)) +
            (await rpc.getMinimumBalanceForRentExemption(165))
          : action === "withdraw" && !(await rpc.getAccountInfo(tokenAccount))
            ? await rpc.getMinimumBalanceForRentExemption(165)
            : 0;
      if (state.lamports < (fee.value ?? 5000) + rent)
        throw new Error(
          "Add devnet SOL to your wallet for transaction fees and account rent.",
        );
      return { transaction, ...lifetime };
    },
  };
}

export const client = merchantClient();
export const explorer = (value: string, kind: "address" | "tx" = "address") =>
  `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;
