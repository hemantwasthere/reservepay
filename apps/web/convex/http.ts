import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { allowedDomain } from "../src/lib/sign-in";

const http = httpRouter();

const requestOrigin = (request: Request): string | null => {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    return allowedDomain(new URL(origin).host) ? origin : null;
  } catch {
    return null;
  }
};

const headers = (request: Request, contentType = false) => ({
  ...(contentType ? { "Content-Type": "application/json" } : {}),
  "Access-Control-Allow-Origin": requestOrigin(request) ?? "",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

// Nonce requests go through this HTTP endpoint (not a public mutation) so
// the rate limit can be keyed on the requester's IP address.
http.route({
  path: "/sign-in/nonce",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, { status: 204, headers: headers(request) });
  }),
});

http.route({
  path: "/sign-in/nonce",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body: unknown = await request.json();
      const wallet =
        body && typeof body === "object" && "wallet" in body
          ? String(body.wallet)
          : "";
      const requester =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const challenge = await ctx.runMutation(internal.auth.requestNonce, {
        wallet,
        requester,
      });
      return new Response(JSON.stringify(challenge), {
        status: 200,
        headers: headers(request, true),
      });
    } catch (error) {
      const message =
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not start sign-in.";
      return new Response(JSON.stringify({ error: message }), {
        status: message.includes("Too many") ? 429 : 400,
        headers: headers(request, true),
      });
    }
  }),
});

export default http;
