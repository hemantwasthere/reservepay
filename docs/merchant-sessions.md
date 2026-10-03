# Merchant sessions and deployment

A connected wallet approves a versioned sign-in message with a five-minute nonce. Convex verifies the signature, consumes the nonce once, and returns a random session token. Only its SHA-256 hash is stored server-side. Sessions expire after seven days. The browser stores a token per wallet; disconnecting clears it and requests revocation.

Pending logins are canceled on disconnect, explicit sign-out, wallet switch, or unmount. A late session response is never saved and its token is submitted for revocation. If that revocation fails because the network is unavailable, the unsaved token expires server-side after seven days. A canceled attempt cannot replace a newer session.

## Public and private data

- Merchant display name and website are public through `merchants.publicProfile`.
- Contact email and description require the merchant's session. They are not returned by checkout's profile query.
- Payment terms, wallet addresses, on-chain receipts, and refund reason categories remain public.
- New frontend link-history queries use `payments.listForSession`, which derives the merchant from the session rather than trusting a wallet argument.
- `payments.list({ merchant })` remains a compatibility endpoint for existing clients and returns only the same public link documents as before this release. Authentication does not make blockchain or public link history confidential.

## Release sequence

1. Confirm which Convex URL the hosted frontend uses. Development and production Convex deployments are distinct; `convex deploy` targets production by default, while `convex dev --once` updates the selected development deployment.
2. Configure a random server-only `SIGN_IN_SECRET` of at least 32 characters on that deployment if absent. Do not print, commit, or expose it in browser configuration. The README provides a stdin-based setup command. Set `SITE_ORIGIN` if using a custom frontend domain.
3. Run `bun run check`. Session lifecycle regression tests exercise late nonce, wallet-signature, and session responses; sign-out without an existing token; wallet switching; unmounting; duplicate attempts; and a newer successful login.
4. Deploy the additive Convex schema/functions first. Retain the legacy public list API so old browser tabs continue working. Never repurpose its argument shape for the authenticated endpoint.
5. Verify public checkout metadata, the legacy list, nonce issuance, signed session creation, authenticated profile/link queries, and revocation. Use disposable test wallets without funds. Do not exercise financial transactions as an authentication smoke test.
6. Publish the frontend and check `/`, `/app`, `/app/payments`, `/app/profile`, and a valid `/pay/:id` page. Verify CI and the hosting deployment correspond to the published commit.

A frontend rollback can use the previous frontend with this backend because its public APIs remain compatible. Leave the additive backend deployed during that rollback. Removing the new functions while a new frontend is still in use would break checkout and login.
