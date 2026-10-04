# Refunds and order completion (devnet)

A paid link at `/pay/:id` is also the order-management screen. Merchants can open it using **Manage order** in `/app/payments`.

## Buyer refund requests

Connect the wallet that paid, choose **Request refund**, select a public reason, and sign the request. This message does not move funds. The backend verifies the signature, the finalized on-chain buyer and order, and the protection deadline before storing one immutable request per link. Retrying the same request is safe.

Only the reason category and request time are stored. They are public alongside the payment metadata; do not add personal information or private evidence to payment titles. Evidence uploads and private messaging are outside this milestone.

## Resolver decisions

Connect the resolver wallet configured in the deployed protocol. The **Disputes** page at `/app/disputes` lists refund requests, even if that wallet has no merchant account. Open a receipt to either:

- **Approve full refund:** return the entire payment from the reserve to the original buyer token account.
- **Reject refund & complete:** release the retained portion to the merchant and unlock the order’s full liability. This permanently closes the order, including any pending refund request.

Both decisions require the resolver’s on-chain transaction signature. The backend has no wallet keys and cannot move funds. The signing wallet needs devnet SOL for fees and, if necessary, recreating an associated token account.

After protection ends, the merchant can also complete the order, and a keeper releases expired undisputed orders automatically (see [devnet operations](devnet.md)). The client checks Solana’s clock before offering the transaction; the program enforces its own deadline and resolver rules. The underlying program permits anyone to complete after expiry, while the UI offers completion to the merchant and resolver. The keeper never completes an order with a pending refund request; the Disputes page flags those as **Overdue — decide now**.

## Deadlines and recovery

**A refund request does not freeze an order, extend protection, or guarantee a refund.** The current program has no on-chain dispute state. A resolver can refund an open order after the deadline, but completion may happen first. Completed orders cannot be refunded. Resolving before the deadline is the operational responsibility of the configured resolver; there are no email notifications, and refunds are never automatic. Only completion of undisputed expired orders is automatic.

The browser saves a validated signed transaction’s signature and expiration before broadcasting it. An ambiguous RPC failure or reload keeps the action pending and prevents another submission. Finalized on-chain order state determines the receipt and removes resolved requests from the queue. Failed or expired transactions may be retried after verification. Web Locks coordinate tabs in browsers that support them; the program’s open-order check prevents double resolution across devices.

Receipts poll while open. Use **Refresh orders** or the Disputes page’s **Refresh** to recover changes made outside the app. The queue is paginated and sorted by protection deadline, soonest first. A keeper cron releases expired undisputed orders and syncs disputes whose on-chain resolution was never recorded, so resolved requests leave the queue even when nobody reloads a receipt. Private case management, a resolver rotation UI, and mainnet deployment are not included.

## Reconciliation and retries

Solana is the source of truth for funds and settlement; Convex receipts are a cache of the finalized chain state. A keyless Convex cron reconciles that cache with Solana every 2 minutes (see [devnet operations](devnet.md#reconciliation)): it records receipts for orders paid while no client was watching, clears disputes resolved outside the app, advances stale "paid" receipts whose orders completed or refunded, and sweeps links that were never synced at all. Receipts are only written from finalized chain reads and never regress, so refreshing the page, closing a tab, or losing connectivity cannot create an incorrect payment state — the next run repairs it.

Transient RPC failures (rate limits, bad gateways, dropped connections) are retried with jittered exponential backoff on every read, in the browser and on the backend. Checkout status polling backs off after consecutive failures (10 → 20 → 40 → 60 seconds) and checks again immediately when the tab becomes visible or the network returns.

## Validation

`bun run check` covers type checking, unit and Convex tests, production build, SEO and routing. `bun run test:program` runs the Anchor integration suite against a local validator. The suite uses test tokens and checks the actual browser transaction builders, authorization failures, full-refund accounting, reserve release, and duplicate resolution refusal.
