import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU",
);

export {
  BPS_SCALE,
  calculateSettlement,
  formatUsdc,
  reservePosition,
} from "./settlement.js";
export type { Settlement, ReservePosition } from "./settlement.js";

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
