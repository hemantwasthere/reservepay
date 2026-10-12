// convex/rateLimit.ts refuses a burst with "Too many requests. Try again in N
// seconds." Rewrite it in terms of what the person was doing; any other
// message passes through unchanged, so a reworded backend message still shows.
const RATE_LIMITED = /^Too many requests\. Try again in (\d+) seconds?\.$/;

const cause = {
  "sign-in": "You’ve tried to sign in several times in a short period.",
  refund: "This order received several refund requests in a short period.",
};

function duration(seconds: number) {
  if (seconds < 60) return seconds <= 1 ? "1 second" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function rateLimitMessage(
  message: string,
  action: keyof typeof cause,
): string {
  const match = RATE_LIMITED.exec(message);
  if (!match) return message;
  return `${cause[action]} Please wait ${duration(Number(match[1]))}, then try again.`;
}
