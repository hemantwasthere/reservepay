import bs58 from "bs58";
export type Resolution = "refund" | "complete";
export type PendingResolution = {
  signature: string;
  lastValidBlockHeight: number;
  signer: string;
  action: Resolution | "dispute";
};
const key = (id: string) => `reservepay:devnet:resolution:${id}`;
export function loadResolution(id: string): PendingResolution | null {
  const raw = localStorage.getItem(key(id));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingResolution;
  if (
    typeof value.signature !== "string" ||
    bs58.decode(value.signature).length !== 64 ||
    !Number.isSafeInteger(value.lastValidBlockHeight) ||
    value.lastValidBlockHeight <= 0 ||
    typeof value.signer !== "string" ||
    bs58.decode(value.signer).length !== 32 ||
    !["refund", "complete", "dispute"].includes(value.action)
  )
    throw new Error(
      "Saved resolution could not be read. Check the on-chain order before retrying.",
    );
  return value;
}
export const saveResolution = (id: string, value: PendingResolution) =>
  localStorage.setItem(key(id), JSON.stringify(value));
export const clearResolution = (id: string) => localStorage.removeItem(key(id));
