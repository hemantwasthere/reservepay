# Refunds and order completion (devnet)

A paid link at `/pay/:id` is also the order-management screen. Merchants can open it using **Manage order** in `/app/payments`.

## Buyer refund requests

Connect the wallet that paid, choose **Request refund**, select a public reason, and sign the request. This message does not move funds. The backend verifies the signature, the finalized on-chain buyer and order, and the protection deadline before storing one immutable request per link. Retrying the same request is safe.

Only the reason category and request time are stored. They are public alongside the payment metadata; do not add personal information or private evidence to payment titles. Evidence uploads and private messaging are outside this milestone.

## Resolver decisions

Connect the resolver wallet configured in the deployed protocol. The payment workspace shows a **Refund requests** queue, even if that wallet has no merchant account. Open a receipt to either:

- **Approve full refund:** return the entire payment from the reserve to the original buyer token account.
- **Complete order:** release the retained portion to the merchant and unlock the order’s full liability. This permanently closes the order, including any pending refund request.

Both decisions require the resolver’s on-chain transaction signature. The backend has no wallet keys and cannot move funds. The signing wallet needs devnet SOL for fees and, if necessary, recreating an associated token account.

After protection ends, the merchant can also complete the order. The client checks Solana’s clock before offering the transaction; the program enforces its own deadline and resolver rules. The underlying program permits anyone to complete after expiry, while the UI offers completion to the merchant and resolver.

## Deadlines and recovery

**A refund request does not freeze an order, extend protection, or guarantee a refund.** The current program has no on-chain dispute state. A resolver can refund an open order after the deadline, but completion may happen first. Completed orders cannot be refunded. Resolving before the deadline is the operational responsibility of the configured resolver; there are no email notifications or automatic decisions.

The browser saves a validated signed transaction’s signature and expiration before broadcasting it. An ambiguous RPC failure or reload keeps the action pending and prevents another submission. Finalized on-chain order state determines the receipt and removes resolved requests from the queue. Failed or expired transactions may be retried after verification. Web Locks coordinate tabs in browsers that support them; the program’s open-order check prevents double resolution across devices.

Receipts poll while open. Use **Refresh orders** or **Refresh queue** to recover changes made outside the app. The queue shows up to 50 pending orders, sorted by payment-link creation time; resolving and refreshing exposes subsequent orders. A background indexer, private case management, resolver rotation UI, and mainnet deployment are not included.

## Validation

`bun run check` covers type checking, unit and Convex tests, production build, SEO and routing. `bun run test:program` runs the Anchor integration suite against a local validator. The suite uses test tokens and checks the actual browser transaction builders, authorization failures, full-refund accounting, reserve release, and duplicate resolution refusal.
