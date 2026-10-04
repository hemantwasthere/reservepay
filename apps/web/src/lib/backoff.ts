// Polling backoff after failures: 10 → 20 → 40 → 60 with base 10s, max 60s.
export function nextDelay(failures: number, base: number, max: number): number {
  return Math.min(max, base * 2 ** failures);
}
