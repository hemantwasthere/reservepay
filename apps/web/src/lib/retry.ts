import { ConvexError } from "convex/values";

// Retries transient Solana RPC failures (rate limits, bad gateways, dropped
// connections) with full-jitter exponential backoff. Matching is on message
// text because web3.js wraps errors, so instanceof checks do not survive.
// web3.js formats HTTP errors as `${status} ${statusText}: …`, and over
// HTTP/2 statusText is empty ("429 : …"), so the status must be followed by
// a space and then either a capital letter or a colon. The anchoring keeps
// digits inside base58 pubkeys and signatures from matching.
// The status patterns are case-SENSITIVE on purpose: the capital letter is
// the HTTP status text ("429 Too…", "503 Service…"). Case-insensitive, they
// would match program logs such as "consumed 429 of 200000 compute units".
// Only the free-text phrases are case-insensitive.
// Rate limiting (429) is defined once and reused by both classifiers, so a
// new 429 phrasing added here reaches isTransient and isRateLimited alike.
const RATE_LIMITED_STATUS = /\b429 (?:[A-Z]|:)/;
const RATE_LIMITED_TEXT = /Too Many Requests/i;
const SERVER_STATUS = /\b50[234] (?:[A-Z]|:)/;
const NETWORK_TEXT =
  /Failed to fetch|NetworkError|Load failed|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i;

const rateLimited = (message: string) =>
  RATE_LIMITED_STATUS.test(message) || RATE_LIMITED_TEXT.test(message);
const serverOrNetwork = (message: string) =>
  SERVER_STATUS.test(message) || NETWORK_TEXT.test(message);

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function isTransient(error: unknown): boolean {
  // ConvexError messages are for users; program and validation errors ("does
  // not match") are deterministic. Neither is helped by retrying.
  if (error instanceof ConvexError) return false;
  const message = messageOf(error);
  if (/does not match/i.test(message)) return false;
  return rateLimited(message) || serverOrNetwork(message);
}

// 429 specifically: the RPC is throttling us.
export function isRateLimited(error: unknown): boolean {
  if (error instanceof ConvexError) return false;
  return rateLimited(messageOf(error));
}

// Release policy for a rate-limit slot whose guarded chain read failed: give
// the slot back only for server or network failures, so the next caller can
// retry. Keep it on 429 (retrying would amplify the throttling) and on
// deterministic failures (an attacker-created mismatched order would
// otherwise bypass the limit entirely).
export function releasesRateLimitSlot(error: unknown): boolean {
  return isTransient(error) && !isRateLimited(error);
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
