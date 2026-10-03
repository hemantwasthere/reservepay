# Merchant sessions and deployment

A connected wallet approves a versioned sign-in message with a five-minute nonce. Convex verifies the signature, consumes the nonce once, and returns a random session token. Only its SHA-256 hash is stored server-side. Sessions expire after seven days. The browser stores a token per wallet; disconnecting clears it and requests revocation.

Pending logins are canceled on disconnect, explicit sign-out, wallet switch, or unmount. A late session response is never saved and its token is submitted for revocation. If that revocation fails because the network is unavailable, the unsaved token expires server-side after seven days. A canceled attempt cannot replace a newer session.

## Public and private data

- Merchant display name, image and website are public through `merchants.publicProfile`.
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

## Workspace navigation and merchant images

Sidebar links use browser history within the workspace. The wallet/session provider and all three views stay mounted, keeping Convex subscriptions and form drafts alive. Back/forward, direct URLs, reloads, and modifier-clicks still work. Hidden views are excluded from keyboard shortcuts. Wallet changes reset view data; session expiry and server revocation still end access.

Overview and Payment Links share one reserve-account result. Balances and on-chain orders refresh through Solana RPC every 20 seconds while the document is visible and on window focus. Convex profile/link updates remain reactive; they do not require a reload. Clean profile forms follow incoming changes, while unsaved edits remain intact.

The uploader accepts PNG/JPG/WebP source files up to 2 MB, decodes and resizes them to at most 512 pixels per side, and produces an optimized raster image. Backend uploads are limited to 256 KB and verify the raster signature and content type. SVG/HTML uploads are rejected. Images are public branding, with bearer URLs from [Convex file storage](https://docs.convex.dev/file-storage/overview).

The upload action authenticates before storing bytes and checks the session again when saving the profile. Only an internal mutation can attach a storage ID, preventing clients from attaching or deleting somebody else's file. Replacements/removals delete the previous file; rejected saves delete the newly uploaded file. Removing an image or changing it takes effect when the merchant saves the profile. Public profile queries expose the image URL, name and website only; contact email and description stay private.
