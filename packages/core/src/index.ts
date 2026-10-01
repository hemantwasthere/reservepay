import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU",
);

export const BPS_SCALE = 10_000n;

export type Settlement = {
  amount: bigint;
  merchantAmount: bigint;
  reserveAmount: bigint;
  reserveBps: number;
};

export type ReservePosition = {
  balance: bigint;
  lockedLiability: bigint;
  available: bigint;
  coverageBps: number;
};

export function calculateSettlement(
  amount: bigint,
  reserveBps: number,
): Settlement {
  if (amount <= 0n) {
    throw new RangeError("Amount must be greater than zero");
  }

  if (!Number.isInteger(reserveBps) || reserveBps < 0 || reserveBps > 10_000) {
    throw new RangeError(
      "Reserve rate must be between 0 and 10,000 basis points",
    );
  }

  const reserveAmount =
    (amount * BigInt(reserveBps) + BPS_SCALE - 1n) / BPS_SCALE;

  return {
    amount,
    merchantAmount: amount - reserveAmount,
    reserveAmount,
    reserveBps,
  };
}

export function reservePosition(
  balance: bigint,
  lockedLiability: bigint,
): ReservePosition {
  if (balance < 0n || lockedLiability < 0n) {
    throw new RangeError("Reserve values cannot be negative");
  }

  const available = balance > lockedLiability ? balance - lockedLiability : 0n;
  const coverageBps =
    lockedLiability === 0n
      ? 10_000
      : Number((balance * BPS_SCALE) / lockedLiability);

  return { balance, lockedLiability, available, coverageBps };
}

export function createReference(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function referenceFromString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const output = new Uint8Array(16);
  output.set(bytes.slice(0, output.length));
  return output;
}

export function protocolAddress(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("protocol")],
    PROGRAM_ID,
  )[0];
}

export function merchantAddress(
  authority: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("merchant"), authority.toBytes(), mint.toBytes()],
    PROGRAM_ID,
  )[0];
}

export function orderAddress(
  merchant: PublicKey,
  reference: Uint8Array,
): PublicKey {
  if (reference.length !== 16) {
    throw new RangeError("Order reference must contain 16 bytes");
  }

  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("order"), merchant.toBytes(), reference],
    PROGRAM_ID,
  )[0];
}

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0");
  return `${whole.toLocaleString("en-US")}.${fraction.slice(0, 2)}`;
}
