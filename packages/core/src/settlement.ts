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

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0");
  return `${whole.toLocaleString("en-US")}.${fraction.slice(0, 2)}`;
}
