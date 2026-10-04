# Refunds and order completion (devnet)

A paid link at `/pay/:id` is also the order-management screen. Merchants can open it using **Manage order** in `/app/payments`.

## Buyer refund requests

Connect the wallet that paid, choose **Request refund**, select a public reason, and sign the request. This message does not move funds. The backend verifies the signature, the on-chain buyer and order, and the protection deadline before storing one request per link. Retrying the same request is safe; a different reason is refused once a reason is on file.

Two exceptions to those rules:

- **Reason not provided.** A dispute raised directly on-chain is recorded with the placeholder reason *Reason not provided*. The buyer's own signed reason may replace that placeholder (keeping the original request time) while the order is still open. Once the resolver has decided, a late reason is refused with *already resolved*, and the outcome stays recorded without one. Replacing the placeholder does not send a second inbox notification: the resolver sees the reason on the Disputes page.
- **Disputed before the deadline.** If the order was flagged `Disputed` on-chain before protection ended, the buyer can still add a reason after the deadline, because the program already enforced the window when the dispute was raised. The backend decides this from a confirmed chain read, since the stored receipt can lag a fresh dispute.

`REQUIRE_ONCHAIN_DISPUTE=1` (Convex environment) refuses signed reasons for orders that are not yet `Disputed` on-chain, with *Submit the on-chain dispute first*. Leave it unset until the app's Request refund button sends the dispute transaction.

The on-chain half of this flow is rolling out: the program already supports `request_refund`, which flags the order `Disputed` before protection expires, but the app's Request refund button does not send that transaction yet (it is being shipped separately). Until then, a UI request is recorded off-chain only and does not by itself block completion — the keeper still skips orders with a pending request by policy. Disputes raised directly on-chain (outside the app) appear in the resolver queue with **Reason not provided** once reconciliation records them.

Only the reason category and request time are stored. They are public alongside the payment metadata; do not add personal information or private evidence to payment titles. Evidence uploads and private messaging are outside this milestone.

## Resolver decisions

Connect the resolver wallet configured in the deployed protocol. The **Disputes** page at `/app/disputes` lists refund requests, even if that wallet has no merchant account. Open a receipt to either:

- **Approve full refund:** return the entire payment from the reserve to the original buyer token account.
- **Reject refund & complete:** release the retained portion to the merchant and unlock the order’s full liability. This permanently closes the order, including any pending refund request.

Both decisions require the resolver’s on-chain transaction signature. The backend never holds buyer, merchant, or resolver keys. An optionally configured keeper uses its own fee-paying key to complete expired undisputed orders; it cannot approve refunds. The signing wallet needs devnet SOL for fees and, if necessary, recreating an associated token account.

After protection ends, the merchant can also complete the order, and a keeper releases expired undisputed orders automatically (see [devnet operations](devnet.md)). The client checks Solana’s clock before offering the transaction; the program enforces its own deadline and resolver rules. The underlying program permits anyone to complete an undisputed order after expiry, while the UI offers completion to the merchant and resolver. Disputed orders are never auto-released: only the resolver can complete or refund them. The keeper never completes an order with a pending refund request; the Disputes page flags those as **Overdue — decide now**.

## Deadlines and recovery

**A refund request does not extend protection or guarantee a refund.** Once raised on-chain (`request_refund`, before protection ends), a dispute flags the order `Disputed`: only the configured resolver can then complete or refund it, including after expiry. Until the app's Request refund button sends that transaction (in rollout), UI-filed requests are recorded off-chain only, so completion can still beat them — resolving promptly remains the resolver's operational responsibility. Undisputed orders are unaffected: after protection ends, completion stays permissionless and the keeper releases expired ones automatically. Completed orders cannot be refunded. There are no email notifications, and refunds are never automatic. Only completion of undisputed expired orders is automatic.

**Known limitation (devnet):** a buyer can keep a merchant's reserve locked indefinitely by disputing just before expiry — only the resolver clears a dispute and there is no resolver-inaction grace period yet. Resolve disputes promptly; a timeout after which a disputed order becomes completable is planned before mainnet.

The browser saves a validated signed transaction’s signature and expiration before broadcasting it. An ambiguous RPC failure or reload keeps the action pending and prevents another submission. Finalized on-chain order state determines the receipt and removes resolved requests from the queue. Failed or expired transactions may be retried after verification. Web Locks coordinate tabs in browsers that support them; the program’s open-order check prevents double resolution across devices.

Receipts poll while open. Use **Refresh orders** or the Disputes page’s **Refresh** to recover changes made outside the app. The queue is paginated and sorted by protection deadline, soonest first. A keeper cron releases expired undisputed orders and syncs disputes whose on-chain resolution was never recorded, so resolved requests leave the queue even when nobody reloads a receipt. Private case management, a resolver rotation UI, and mainnet deployment are not included.

## Reconciliation and retries

Solana is the source of truth for funds and settlement; Convex receipts are a cache of the finalized chain state. A keyless Convex cron reconciles that cache with Solana every 2 minutes (see [devnet operations](devnet.md#reconciliation)): it records receipts for orders paid while no client was watching, clears disputes resolved outside the app, advances stale "paid" receipts whose orders completed or refunded, and sweeps links that were never synced at all. Receipts are only written from finalized chain reads and never regress, so refreshing the page, closing a tab, or losing connectivity cannot create an incorrect payment state — subsequent successful runs repair stale receipts as the sweeps advance.

Transient RPC failures (rate limits, bad gateways, dropped connections) are retried with jittered exponential backoff on payment-status, balance, order-list, and reconciliation reads in the browser and on the backend. Checkout status polling backs off after consecutive failures (10 → 20 → 40 → 60 seconds) and checks again immediately when the tab becomes visible or the network returns.

## Validation

`bun run check` covers type checking, unit and Convex tests, production build, SEO and routing. `bun run test:program` runs the Anchor integration suite against a local validator. The suite uses test tokens and checks the actual browser transaction builders, authorization failures, full-refund accounting, reserve release, and duplicate resolution refusal.


## Inbox updates

The workspace header bell opens the signed-in wallet's inbox. Buyers and merchants receive refund-request and finalized resolution updates; the current resolver receives pending-dispute updates through the reminder worker. Reminder checks run every two minutes, with one update in the final hour of protection and one after the deadline for orders still recorded as open. Notifications may arrive late during backlog or RPC outages and never extend protection or submit a transaction. Open the linked receipt for the latest state. Read/unread state is private to the wallet; email and push delivery are not enabled.
