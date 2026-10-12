<div align="center">

<a href="https://reservepayyy.vercel.app/">
  <img src="apps/web/public/logo.svg" alt="ReservePay logo" width="88" height="88">
</a>

# ReservePay

**Get paid now. Keep buyers protected.**

ReservePay is a USDC payment app on Solana. Merchants receive most of each payment immediately, while a funded reserve backs full refunds for open orders. Buyers pay through a shareable link and keep an on-chain receipt.

[![Checks](https://img.shields.io/github/actions/workflow/status/hemantwasthere/reservepay/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=checks)](https://github.com/hemantwasthere/reservepay/actions/workflows/ci.yml)
[![Network: Solana devnet](https://img.shields.io/badge/network-Solana%20devnet-9945FF?style=flat-square&logo=solana&logoColor=white)](https://explorer.solana.com/address/ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU?cluster=devnet)
[![Live demo](https://img.shields.io/badge/demo-live-426b36?style=flat-square&logo=vercel&logoColor=white)](https://reservepayyy.vercel.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-426b36?style=flat-square)](LICENSE)

**[Open the app](https://reservepayyy.vercel.app/app)** · **[Explore the product](https://reservepayyy.vercel.app/)** · **[Payment links](https://reservepayyy.vercel.app/app/payments)** · **[Build checks](https://github.com/hemantwasthere/reservepay/actions/workflows/ci.yml)**

</div>

> [!IMPORTANT]
> **Devnet preview.** The current app uses test USDC and devnet SOL, which have no monetary value. It is not a mainnet payment service.

<p align="center">
  <img src="docs/images/landing.png" alt="ReservePay landing page showing instant merchant settlement and reserve-backed payment protection" width="100%">
</p>

<p align="center">
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-what-you-can-do-today">Features</a> ·
  <a href="#-protection-has-a-deadline">Protection</a> ·
  <a href="#-current-scope">Scope</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-run-locally">Run locally</a> ·
  <a href="#-devnet-deployment">Deployment</a> ·
  <a href="#-documentation">Docs</a> ·
  <a href="#-contributing">Contributing</a> ·
  <a href="#-license">License</a>
</p>

---

## 💡 How it works

1. **Fund a reserve.** The merchant registers an on-chain account and deposits collateral into its reserve vault.
2. **Share a payment link.** The merchant approves a title, amount, and protection period with a wallet signature. Each link accepts one payment.
3. **Get paid immediately.** At checkout, the program sends the merchant’s share to their wallet and adds the retained portion to their reserve. It locks liability for the **full payment**, backed by the reserve’s existing collateral plus the new retention.
4. **Resolve the order.** Completion releases the retained portion and unlocks the liability. An authorized resolver can instead return the full payment to the original buyer from the reserve.

<p align="center">
  <img src="docs/images/payment-flow.png" alt="A 100 USDC payment sends 95 USDC to the merchant and adds 5 USDC to existing collateral; completion and a full refund are the two final outcomes" width="100%">
</p>

> [!NOTE]
> The diagram uses a 5% reserve rate and assumes no other open orders. The retained 5 USDC alone does **not** cover a 100 USDC refund: the merchant needs at least 95 USDC of existing collateral. Reserve rates come from the merchant’s on-chain configuration.

### Reserve coverage

For a new payment to succeed:

```text
reserve balance + new retained amount ≥ existing locked liability + payment amount
```

Merchants can withdraw only the surplus above locked liability. Reserve checks, transfers, and order status changes are enforced by the Solana program.

---

## ✨ What you can do today

| Merchant                                            | Buyer                                                    | Resolver                                           |
| --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Sign in with a Solana wallet and register a reserve | Pay a single-use link with devnet USDC                   | Review pending refund requests                     |
| Deposit collateral and withdraw available funds     | View a receipt verified against finalized chain state    | Approve a full refund to the original buyer        |
| Create links and follow payment history             | Submit a signed refund request before protection expires | Complete an open order, including before expiry    |
| Complete orders after protection expires            | Follow the order’s final status from the same URL        | Approve every resolution with a wallet transaction |

<table>
  <tr>
    <th width="50%">Merchant workspace</th>
    <th width="50%">Buyer checkout</th>
  </tr>
  <tr>
    <td valign="top"><img src="docs/images/overview.png" alt="Merchant overview with reserve balances, setup steps, and collateral controls in the disconnected-wallet state" width="100%"></td>
    <td valign="top"><img src="docs/images/checkout.png" alt="Buyer checkout for a sample 1.25 USDC design consultation on Solana devnet" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub><em>Live devnet UI, shown before connecting a wallet.</em></sub></td>
    <td align="center"><sub><em>Sample devnet payment link. No wallet is connected in this screenshot.</em></sub></td>
  </tr>
</table>

<details>
<summary><b>Merchant workspace</b> — reserve overview, merchant profile, sessions and live data</summary>
<br>

The overview separates total reserve, funds backing open orders, and funds available to withdraw, with an on-chain order list filtered by open, completed, or refunded status. Payment links live on their own page. Sign a wallet message to access your link history and merchant profile; this login does not transfer funds.

- **Merchant profile:** At `/app/profile`, save a merchant name, image and website for buyers to see at checkout. Upload a PNG, JPG or WebP image (up to 2 MB); the app optimizes it before storing it in Convex. Images also appear on payment receipts. Contact email and description stay private to your signed-in wallet.
- **Staying signed in:** Sessions last up to seven days; disconnecting signs out and cancels any pending login. Navigation between the landing page and workspace keeps the wallet, session and Convex subscriptions mounted, so switching sections or returning home preserves loaded data and unsaved profile edits. A full browser reload reconnects and validates the session; refreshing is not required to receive updates.
- **Live data:** Profile and payment-link updates arrive through Convex subscriptions. Solana balances and order accounts share a background RPC refresh; the backend also reconciles finalized payment receipts every two minutes.

</details>

<details>
<summary><b>Inbox and reminders</b> — refund updates, protection reminders and read state</summary>
<br>

Open the bell in the workspace header and sign in with your wallet. Merchants and buyers receive refund-request acknowledgements and finalized refund/completion updates for their orders. The current on-chain resolver receives pending-dispute notifications on the background sweep. No merchant registration is needed to read a buyer's inbox.

- **Reminders:** Protection reminders are generated once within the final hour and once after the deadline if the cached order remains open. The worker checks every two minutes and resumes through large queues; backlog or network delays can make reminders late. A refund request does not extend protection. Always use the receipt for current status and deadlines.
- **Unread updates:** Unread counts update live (capped at **99+**); opening the inbox does not mark anything read. Mark an individual update or the displayed batch as read, and load older updates as needed. Inbox contents and read state belong to the signed-in wallet and persist across devices. Historical updates can describe an order that has since resolved. Email and push delivery are not enabled.

</details>

<details>
<summary><b>Buyer checkout</b> — what each payment link shows</summary>
<br>

Each link shows the amount, merchant name (when configured), wallet, network, and protection period. After payment, the same URL becomes the receipt and the entry point for refund requests and order resolution.

</details>

<details>
<summary><b>Interface and appearance</b> — sidebar, navigation, wallet switching and color themes</summary>
<br>

The app also includes a collapsible sidebar (<kbd>⌘B</kbd>), mobile navigation, System/Light/Dark appearance, wallet switching, and recovery for pending transactions after a reload or uncertain network response. Components use Tailwind CSS and locally customized shadcn primitives.

The appearance menu is in the header on the landing page, workspace and checkout. Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> (<kbd>⌥⇧T</kbd> on Mac) to cycle System → Light → Dark. Your choice persists across reloads and tabs; System follows changes to your device’s color scheme.

</details>

---

## ⏳ Protection has a deadline

> [!IMPORTANT]
> **A request does not move the protection deadline or guarantee a refund.** A dispute must be raised on-chain before the deadline; once it is, the order is held for the resolver even after the deadline passes: only the configured resolver can then complete or refund it, and the resolver can still approve a refund after the deadline.

- **Refund requests:** A buyer’s signed message records their refund request; it does not transfer funds. When `VITE_ONCHAIN_DISPUTES=true`, the buyer first approves an on-chain dispute, then signs a public reason after confirmation. Reloads and cancelled reason signing can resume without submitting another dispute. The flag defaults off until the matching backend and program are deployed; requests remain off-chain during that staged rollout.
- **Completion:** For undisputed orders, completion after protection expires is permissionless in the program; the app offers it to the merchant and resolver, and a configured, funded keeper completes expired undisputed orders automatically. The resolver can also complete early. Once an order is completed, it cannot be refunded through the program.
- **Public data:** Payment metadata, receipts, and refund reason categories are public. Do not put private customer details in a payment title.
- **Limits:** The current workflow does not provide private evidence uploads, partial refunds, or email/push notifications. The workspace inbox provides wallet-scoped refund updates and protection reminders. Dispute decisions stay manual; only completion of undisputed expired orders is automatic.

See [refund and completion behavior](docs/order-resolution.md) for the complete workflow and recovery details.

---

## 🎯 Current scope

- **Single-use USDC links:** up to 10,000 USDC with 1 hour, 1 day, or 7 days of protection in the current UI.
- **Recent history:** the latest 50 merchant links; the resolver's dispute queue paginates.
- **Receipt updates:** background reconciliation every two minutes, browser polling, and manual refresh. The hosted devnet keeper releases expired undisputed orders. Workspace service status covers receipt synchronization, reserve releases and inbox reminders, including failed or delayed runs.
- **Resolver-based refunds:** full refunds only, with wallet approval.
- **Test network:** mainnet launch, external alerting, and a security audit remain separate work.

---

## 🧱 Architecture

<div align="center">

[![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com/)
[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Anchor](https://img.shields.io/badge/Anchor-1F6FEB?style=for-the-badge)](https://www.anchor-lang.com/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![Convex](https://img.shields.io/badge/Convex-EE342F?style=for-the-badge&logo=convex&logoColor=white)](https://www.convex.dev/)
[![Bun](https://img.shields.io/badge/Bun-14151A?style=for-the-badge&logo=bun&logoColor=FBF0DF)](https://bun.sh/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

</div>

```mermaid
flowchart LR
    W[Solana wallet] -->|Signs messages and transactions| UI[React app]
    UI -->|Payment links and refund requests| C[Convex]
    UI -->|Signed transactions via RPC| P[Solana program]
    C -->|Verifies finalized orders via RPC| P
    P --> V[Merchant reserve vault]
    P --> O[On-chain order accounts]
    C -->|Verified receipt updates| UI
```

- **Web app:** React, TypeScript, Vite, Tailwind CSS, and shadcn components.
- **Application backend:** Convex stores merchant profiles, hashed session tokens, approved link terms, verified receipts, and signed refund requests. It verifies signatures and chain state. The optional keeper holds a dedicated devnet fee key for permissionless completion; merchant, buyer, and resolver keys remain in their wallets.
- **Solana program:** Rust and Anchor enforce reserve coverage, payment splits, withdrawals, refunds, and completion.
- **Shared core:** Settlement calculations, program addresses, and PDA derivation.
- **Hosting:** Vercel serves the frontend. Convex functions and schema are deployed separately.

<details>
<summary><b>Repository layout</b> — where each part of the code lives</summary>
<br>

```text
apps/web/
  src/merchant/       Reserve workspace and wallet transactions
  src/payments/       Links, checkout, receipts, and resolution
  src/components/     Shared shadcn-based UI components
  convex/             Backend schema, queries, mutations, and actions
  tests/              Frontend logic and Convex tests
packages/core/        Shared settlement math and Solana addresses
programs/reservepay/  Anchor program
tests/                Local-validator integration tests
docs/                 Workflow documentation and product images
```

</details>

---

## 🚀 Run locally

You need [Bun](https://bun.sh/) **1.3.14 or newer**, a [Convex](https://www.convex.dev/) account/deployment, and a Solana wallet with devnet support for transaction flows. Frontend development does not require a local Solana validator.

```bash
git clone https://github.com/hemantwasthere/reservepay.git
cd reservepay
bun install --frozen-lockfile
bun run dev
```

The development command builds the shared package, starts Convex development, and launches Vite. On first run, follow Convex’s prompts to connect or create your own development deployment. Open the local URL printed by Vite.

> [!TIP]
> Use devnet SOL for fees and account rent, and devnet USDC for payments and reserve deposits. A merchant must register and fund enough collateral before accepting a payment. Use a different wallet to pay that merchant’s link.

<details>
<summary><b>Environment variables</b> — web app, Convex backend and production settings</summary>
<br>

**Web app**

The web app reads its local configuration from `apps/web/.env.local`:

```dotenv
CONVEX_DEPLOYMENT=dev:your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
```

| Variable                | Used for                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CONVEX_DEPLOYMENT`     | Convex CLI deployment selection; use the value generated for your project                                          |
| `VITE_CONVEX_URL`       | Frontend connection to the Convex backend                                                                          |
| `VITE_CONVEX_SITE_URL`  | Convex HTTP endpoint; currently not consumed by app code                                                           |
| `VITE_ONCHAIN_DISPUTES` | Set to `true` only after the dispute-capable backend and program are deployed; rebuild the frontend. Defaults off. |
| `VERCEL_OIDC_TOKEN`     | Optional Vercel CLI authentication in root `.env.local`; not required to run the app                               |

> 🛑 **Caution:** `VITE_` values are public browser configuration. Keep secrets out of them.

Local environment files are gitignored. Without `VITE_CONVEX_URL`, the frontend can render, but payment-link data and backend workflows are unavailable.

**Convex backend**

Configure `SIGN_IN_SECRET` on the **Convex backend**, not in a `VITE_` variable. It must be a cryptographically random value of at least 32 characters. From `apps/web`, this generates a 32-byte secret and sends it to the selected development deployment without printing it:

```bash
openssl rand -hex 32 | bunx convex env set SIGN_IN_SECRET
```

Three more server-only backend variables control the order keeper and reconciliation; all are optional while you develop. Without `KEEPER_SECRET_KEY` the keeper skips every run and changes nothing, but payment reconciliation keeps running.

| Variable                  | Used for                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `KEEPER_SECRET_KEY`       | Base58 secret of the dedicated keeper keypair; enables automatic release of expired orders                                          |
| `SOLANA_RPC_URL`          | Optional dedicated RPC for background reconciliation, order release, and post-release syncs; defaults to public devnet              |
| `KEEPER_RPC_URL`          | Fallback alias for `SOLANA_RPC_URL`                                                                                                 |
| `REQUIRE_ONCHAIN_DISPUTE` | Set to `1` to refuse refund reasons for orders not yet `Disputed` on-chain; leave unset until the app sends the dispute transaction |

See [devnet operations](docs/devnet.md) for keeper funding, reconciliation, and protocol setup.

**Production**

For production, select the intended deployment with the Convex CLI's `--prod` option. Optional backend `SITE_ORIGIN` restricts sign-in to an exact origin such as `https://your-app.example.com` (no trailing slash). Without it, the hosted ReservePay domain and localhost are accepted. Keep an existing secret when redeploying; rotating it invalidates outstanding login challenges.

</details>

<details>
<summary><b>Commands</b> — scripts for development, checks, builds and the program</summary>
<br>

Run these from the repository root:

| Command                 | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `bun run dev`           | Shared-package build, Convex development, and Vite            |
| `bun run dev:web`       | Vite only; build the shared package first on a fresh checkout |
| `bun run dev:backend`   | Convex development only                                       |
| `bun run check`         | Type checking, tests, production build, SEO, and route checks |
| `bun run test`          | Core, frontend logic, and Convex tests                        |
| `bun run build`         | Production frontend build and prerendering                    |
| `cargo check`           | Rust workspace validation                                     |
| `bun run build:program` | Build the program; fail on any stack frame over 4096 bytes    |
| `bun run test:program`  | Anchor integration tests on a local validator                 |
| `bun run idl:sync`      | Copy the built IDL and TS types into `apps/web/src/merchant/` |
| `bun run idl:check`     | Fail if the committed IDL differs from `target/`              |

</details>

<details>
<summary><b>Solana program</b> — toolchain pin, fresh-clone builds and IDL sync</summary>
<br>

The Anchor integration suite additionally requires Rust, the Solana CLI/local validator, and the Anchor CLI. The toolchain used by CI and new builds is pinned in [Anchor.toml](Anchor.toml) `[toolchain]`: **anchor-cli 1.0.2** with **Agave (solana-cli) 3.1.7**.

> ⚠️ **Warning:** Because of that pin, any `anchor` command in this repo switches your **global** Solana install (via `agave-install`) and anchor version (via `avm`) to those versions when they differ, which may need a download and affects other projects on the machine; switch back afterwards if you work on projects with different pins.

The suite creates a local test mint and tests reserve accounting using disposable test tokens. `bun run test:program` builds the shared package, runs `bun run build:program` (`anchor build --ignore-keys` that also fails on any instruction stack frame over the 4096-byte limit), then selects Agave's `solana-test-validator` with `--validator legacy`; bare `anchor test` defaults to surfpool in anchor-cli 1.0.x.

On a fresh clone, `anchor build` fails with _"Program ID mismatch"_: the deployer's program keypair is not in the repo, so anchor generates a random one that doesn't match `declare_id!`. Build with **`anchor build --ignore-keys`** — the local validator loads the program at the `Anchor.toml` address regardless.

> 🛑 **Caution:** Never run `anchor keys sync`: it would rewrite the program ID in `declare_id!` and `Anchor.toml`, pointing the app at a program that doesn't exist.

After changing the program, run `bun run build:program && bun run idl:sync` and commit the updated `apps/web/src/merchant/reservepay.{json,ts}` together with the program change — the backend decodes accounts and errors from these files. CI fails the `program` job with a diff when the committed IDL drifts from the build output.

</details>

---

## 🌐 Devnet deployment

| Account            | Address                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ReservePay program | [`ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU`](https://explorer.solana.com/address/ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU?cluster=devnet) |
| Protocol PDA       | [`5ZBgXZK52BbeJyap8dEcammaxkCXDfzrfEaFsPmRUvTt`](https://explorer.solana.com/address/5ZBgXZK52BbeJyap8dEcammaxkCXDfzrfEaFsPmRUvTt?cluster=devnet) |
| Devnet USDC mint   | [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) |

Protocol initialization, resolver rotation, and keeper configuration live in [devnet operations](docs/devnet.md).

<details>
<summary><b>Deploying the frontend and backend</b> — Vercel, Convex and API compatibility</summary>
<br>

- **Frontend (Vercel):** Vercel builds with `bun run build` and serves `apps/web/dist`. Configure `VITE_CONVEX_URL` for the intended backend before building. A frontend deployment does **not** deploy Convex changes or the Solana program.
- **Backend (Convex):** Deploy backend changes to the matching Convex deployment before enabling frontend code that depends on them. For a production Convex deployment, run `bun run deploy:backend` from `apps/web` with that deployment’s credentials. For a development deployment, use `bunx convex dev --once` there. Check the target deployment carefully; the hosted app still transacts on Solana **devnet**.
- **API compatibility:** Link history is session-only and paginated: the app pages it through `payments.listForSessionPaginated`, and the unauthenticated `payments.list({ merchant })` and non-paginated `payments.listForSession({ session })` were removed — frontends older than `998951b` lose link history. Link terms and receipts remain public through `payments.get` and the refund queue, never merchant profile fields. Checkout checks current link availability through a server action before preparing payment and again after wallet approval. Deploy the backend first, verify the APIs and sign-in, then publish the frontend. See [the deployment checklist](docs/merchant-sessions.md).

</details>

---

## 📚 Documentation

- [Refunds and order completion](docs/order-resolution.md) — buyer refund requests, resolver decisions, deadlines and recovery
- [Devnet operations](docs/devnet.md) — protocol setup, program redeploys, the keeper, reconciliation and service health
- [Merchant sessions and deployment](docs/merchant-sessions.md) — public and private data, and the release sequence
- [UI conventions](apps/web/src/components/README.md) — Tailwind CSS and shadcn component conventions

---

## 🤝 Contributing

For UI changes, follow the [component conventions](apps/web/src/components/README.md). For payment changes, keep the [order-resolution rules](docs/order-resolution.md) and on-chain accounting in sync.

Every pull request runs the [Checks workflow](.github/workflows/ci.yml): `bun run check` and `cargo check` for the app, plus formatting, Clippy, the IDL drift check, and the Anchor integration tests for the program. Run `bun run check` before you open a pull request.

---

## 📄 License

ReservePay is released under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Built on Solana · Settled in USDC · <a href="#reservepay">Back to top ↑</a></sub>
</p>
