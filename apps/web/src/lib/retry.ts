import { ConvexError } from "convex/values";

// Retries transient Solana RPC failures (rate limits, bad gateways, dropped
// connections) with full-jitter exponential backoff. Matching is on message
// text because web3.js wraps errors, so instanceof checks do not survive.
// web3.js formats HTTP errors as `${status} ${statusText}: …`, and over
// HTTP/2 statusText is empty ("429 : …"), so the status must be followed by
// a space and then either a capital letter or a colon. The anchoring keeps
// digits inside base58 pubkeys and signatures from matching.
const TRANSIENT_STATUS = /\b(429|50[234]) (?:[A-Z]|:)/;
const TRANSIENT_NETWORK =
  /Too Many Requests|Failed to fetch|NetworkError|Load failed|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i;

export function isTransient(error: unknown): boolean {
  // ConvexError messages are for users; program and validation errors ("does
  // not match") are deterministic. Neither is helped by retrying.
  if (error instanceof ConvexError) return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/does not match/i.test(message)) return false;
  return TRANSIENT_STATUS.test(message) || TRANSIENT_NETWORK.test(message);
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Reads only: never wrap a send. With the defaults the worst-case extra wait
// is 0.4 + 0.8 + 1.6 = 2.8s.
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 3,
    baseMs = 400,
    maxMs = 4_000,
    signal,
  }: {
    retries?: number;
    baseMs?: number;
    maxMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) throw abortError();
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isTransient(error) || signal?.aborted)
        throw error;
      await sleep(
        Math.random() * Math.min(maxMs, baseMs * 2 ** attempt),
        signal,
      );
    }
  }
}
