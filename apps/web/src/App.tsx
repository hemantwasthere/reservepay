import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  Code2,
  ExternalLink,
  Github,
  LockKeyhole,
  LoaderCircle,
  Menu,
  RotateCcw,
  Pause,
  Play,
  ShieldCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { calculateSettlement, formatUsdc } from "@reservepay/core/settlement";

import { ConvexError } from "convex/values";
import { useDemoStore, type DemoOrder } from "./lib/demo-store";
import { PaymentHistory } from "./lib/PaymentHistory";
import { useScrollReveal } from "./lib/use-scroll-reveal";

type DemoState = "ready" | "paid" | "completed" | "refunded";
const sourceUrl = "https://github.com/hemantwasthere/reservepay";

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="ReservePay home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      ReservePay<span className="brand-period">.</span>
    </a>
  );
}

function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-label">
      <span>[ {number} ]</span>
      {children}
    </div>
  );
}

function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <Logo />
      <nav
        className={menuOpen ? "navigation is-open" : "navigation"}
        aria-label="Main navigation"
      >
        <a href="#how" onClick={() => setMenuOpen(false)}>
          How it works
        </a>
        <a href="#merchants" onClick={() => setMenuOpen(false)}>
          For merchants
        </a>
        <a href="#protocol" onClick={() => setMenuOpen(false)}>
          Protocol
        </a>
      </nav>
      <div className="header-actions">
        <a
          className="source-link"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View ReservePay on GitHub"
        >
          <Github size={17} />
        </a>
        <a className="button button-dark" href="/app">
          Open app <ArrowUpRight size={15} />
        </a>
        <button
          className="menu-button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

function ReserveVisual() {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const visual = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    if (visual.current) observer.observe(visual.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const [destination, setDestination] = useState<"merchant" | "reserve" | null>(
    null,
  );
  const captionId = useId();
  return (
    <div
      className="reserve-visual"
      ref={visual}
      data-paused={paused || !visible}
      data-reveal
      data-destination={destination ?? "all"}
      aria-label="Example: a 100 USDC payment sends 95 USDC to the merchant and 5 USDC to a reserve, backed by existing collateral for full refund coverage."
    >
      <div className="visual-meta">
        <span>PAYMENT ROUTING</span>
        <span className="status-dot">PROTECTED</span>
      </div>
      <div className="routing-diagram">
        <div className="payer-node">
          <span className="node-icon">
            <Wallet size={18} />
          </span>
          <div>
            <span>BUYER PAYS</span>
            <strong>
              100.00 <small>USDC</small>
            </strong>
          </div>
          <Check size={16} />
        </div>
        <svg
          className="route-lines"
          viewBox="0 0 400 48"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="route-track" d="M200 0V24H97V48M200 24H303V48" />
          <path
            className="route-packet merchant-packet"
            pathLength="100"
            d="M200 0V24H97V48"
          />
          <path
            className="route-packet reserve-packet"
            pathLength="100"
            d="M200 0V24H303V48"
          />
          <circle cx="97" cy="46" r="2" />
          <circle cx="303" cy="46" r="2" />
        </svg>
        <div className="destination-grid">
          <button
            type="button"
            className="destination merchant-destination"
            aria-pressed={destination === "merchant"}
            aria-describedby={captionId}
            onClick={() => setDestination("merchant")}
          >
            <Zap size={17} />
            <span>
              TO THE MERCHANT <ArrowUpRight size={10} />
            </span>
            <strong>
              $95<span>.00</span>
            </strong>
            <small>Available immediately</small>
          </button>
          <button
            type="button"
            className="destination reserve-destination"
            aria-pressed={destination === "reserve"}
            aria-describedby={captionId}
            onClick={() => setDestination("reserve")}
          >
            <LockKeyhole size={17} />
            <span>
              TO THE RESERVE <ArrowUpRight size={10} />
            </span>
            <strong>
              $5<span>.00</span>
            </strong>
            <small>Held through protection</small>
          </button>
        </div>
        <div className="reserve-foundation">
          <div className="reserve-blocks" aria-hidden="true">
            {Array.from({ length: 96 }, (_, i) => (
              <span
                className={i >= 88 ? "new-block" : ""}
                key={i}
                style={
                  {
                    "--block-delay": `${1650 + (i - 88) * 35}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="foundation-label">
            <span>
              <i /> Existing merchant collateral
            </span>
            <span>
              <i /> New reserve
            </span>
          </div>
        </div>
        <div className="coverage-line">
          <ShieldCheck size={17} />
          <span>Full order coverage</span>
          <strong>100%</strong>
        </div>
      </div>
      <div className="flow-caption" id={captionId} role="status">
        <span key={destination ?? "all"}>
          {destination === "merchant"
            ? "95 USDC goes straight to the merchant. No waiting for the order to clear."
            : destination === "reserve"
              ? "5 USDC joins the reserve. Existing collateral backs a full 100 USDC refund."
              : "Follow a 100 USDC payment. Select a destination to see how it works."}
        </span>
      </div>
      <div className="visual-footer">
        <span>ILLUSTRATIVE FLOW</span>
        <button
          type="button"
          className="replay-flow"
          onClick={() => setPaused((value) => !value)}
          aria-label={
            paused
              ? "Resume payment flow animation"
              : "Pause payment flow animation"
          }
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? "RESUME FLOW" : "PAUSE FLOW"}
        </button>
      </div>
    </div>
  );
}

function CheckoutDemo() {
  const [amountInput, setAmountInput] = useState("100");
  const [reserveBps, setReserveBps] = useState(500);
  const store = useDemoStore();
  const [selectedOrder, setSelectedOrder] = useState<DemoOrder | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const activeOrder =
    store.orders.find((order) => order.id === selectedOrder?.id) ??
    selectedOrder;
  const state: DemoState = activeOrder?.status ?? "ready";
  const inputId = useId();
  const amount = Number(amountInput);
  const valid =
    amountInput.trim() !== "" &&
    Number.isFinite(amount) &&
    amount >= 1 &&
    amount <= 10000 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
  const settlement = useMemo(
    () =>
      calculateSettlement(
        BigInt(Math.round((valid ? amount : 100) * 1_000_000)),
        reserveBps,
      ),
    [amount, valid, reserveBps],
  );
  const money = (value: bigint) => `$${formatUsdc(value)}`;
  const finished = state === "completed" || state === "refunded";
  const reset = () => {
    setSelectedOrder(null);
    setError("");
    requestId.current = crypto.randomUUID();
  };
  const selectOrder = (order: DemoOrder) => {
    setAmountInput((Number(order.amount) / 1_000_000).toString());
    setReserveBps(order.reserveBps);
    setSelectedOrder(order);
    setError("");
  };
  const save = async (operation: () => Promise<DemoOrder>) => {
    if (pending || !store.connected) return;
    setPending(true);
    setError("");
    try {
      setSelectedOrder(await operation());
    } catch (cause) {
      setError(
        cause instanceof ConvexError
          ? String(cause.data)
          : "Could not save this demo payment. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };
  const status = {
    ready: "Ready when you are",
    paid: "Payment protected",
    completed: "Order completed",
    refunded: "Buyer refunded",
  }[state];

  return (
    <section
      className="demo-section section-frame"
      id="demo"
      aria-labelledby="demo-title"
    >
      <div className="section-heading" data-reveal>
        <div>
          <SectionLabel number="02">TRY IT YOURSELF</SectionLabel>
          <h2 id="demo-title">
            One payment.
            <br />
            <span>Both sides protected.</span>
          </h2>
        </div>
        <p>
          Follow the money from checkout to settlement.
          <br className="desktop-break" /> Change the amount. Test a refund. See
          what moves.
        </p>
      </div>
      <div className="demo-workbench" data-reveal data-state={state}>
        <div className="checkout-panel">
          <div className="panel-topline">
            <span>
              <span className="tiny-square" /> CHECKOUT
            </span>
            <span className="demo-badge">SIMULATION</span>
          </div>
          <div className="checkout-content">
            <div className="product-row">
              <div className="product-art" aria-hidden="true">
                <span>N</span>
                <i />
              </div>
              <div>
                <span className="muted-label">NORTHSTAR STUDIO</span>
                <h3>Creator Launch Kit</h3>
                <p>Digital assets. Ready for your next idea.</p>
              </div>
            </div>
            <label className="amount-label" htmlFor={inputId}>
              Order total <span>USDC ON SOLANA</span>
            </label>
            <div className={`amount-input ${!valid ? "has-error" : ""}`}>
              <span>$</span>
              <input
                id={inputId}
                aria-label="Order amount"
                aria-invalid={!valid}
                aria-describedby={!valid ? `${inputId}-error` : undefined}
                type="number"
                min="1"
                max="10000"
                step="0.01"
                disabled={pending}
                value={amountInput}
                onChange={(event) => {
                  setAmountInput(event.target.value);
                  reset();
                }}
              />
              <CircleDollarSign size={22} />
            </div>
            {!valid && (
              <p className="input-error" id={`${inputId}-error`}>
                Enter $1–$10,000 with up to two decimal places.
              </p>
            )}
            <div className="protection-note">
              <ShieldCheck size={19} />
              <div>
                <strong>7 days of buyer protection</strong>
                <span>Full refund if the product isn’t delivered.</span>
              </div>
              <Check size={15} />
            </div>
            <div className="checkout-action" aria-live="polite">
              {state === "ready" ? (
                <button
                  className="button button-green pay-button"
                  aria-busy={pending}
                  disabled={!valid || pending || !store.connected}
                  onClick={() =>
                    void save(() =>
                      store.create({
                        amountCents: Math.round(amount * 100),
                        reserveBps,
                        requestId: requestId.current,
                      }),
                    )
                  }
                >
                  {pending ? (
                    "Saving payment…"
                  ) : (
                    <>Simulate payment {valid && money(settlement.amount)}</>
                  )}
                  {pending ? (
                    <LoaderCircle size={17} className="pending-spinner" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              ) : (
                <div className={`payment-status ${state}`} key={state}>
                  <CheckCheck size={19} />
                  <span>{status}</span>
                  <button
                    className="icon-button"
                    aria-label="Reset demo"
                    disabled={pending}
                    onClick={reset}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-800">
                {error}
              </p>
            )}
            {!store.connected && (
              <p role="status" className="mt-3 text-xs text-muted">
                Reconnecting to saved payments. Please wait before continuing.
              </p>
            )}
            {pending && state !== "ready" && (
              <p role="status" className="mt-3 text-xs text-muted">
                Saving resolution…
              </p>
            )}
            <p className="demo-disclaimer">
              <LockKeyhole size={11} /> Interactive demo. No real funds move.
            </p>
          </div>
        </div>
        <div className="settlement-panel">
          <div className="panel-topline">
            <span>BEHIND THE PAYMENT</span>
            <span
              className={`status-dot ${state === "ready" ? "neutral" : ""}`}
            >
              {state === "ready" ? "PREVIEW" : "SIMULATED"}
            </span>
          </div>
          <div className="settlement-content">
            <div className="settlement-heading" key={state}>
              <h3>
                {state === "refunded"
                  ? "A full refund. As promised."
                  : state === "completed"
                    ? "Delivered. Settled. Done."
                    : "Your money, accounted for."}
              </h3>
              <p>
                {state === "refunded"
                  ? "The merchant reserve returns the entire payment."
                  : state === "completed"
                    ? "The retained reserve is released to the merchant."
                    : "Most goes straight to the merchant. A little stays back."}
              </p>
            </div>
            <div className="split-bar" aria-hidden="true">
              <span
                style={{
                  flex:
                    state === "refunded"
                      ? 0
                      : state === "completed"
                        ? 100
                        : 100 - reserveBps / 100,
                }}
              />
              <span
                style={{
                  flex:
                    state === "refunded"
                      ? 100
                      : state === "completed"
                        ? 0
                        : reserveBps / 100,
                }}
              />
            </div>
            <dl className="settlement-values">
              <div>
                <dt>
                  <i className="legend-dot merchant-dot" />
                  {state === "refunded"
                    ? "Returned to buyer"
                    : "Merchant receives"}
                </dt>
                <dd>
                  <span
                    className="settlement-number"
                    key={`${amount}-${reserveBps}-${state}`}
                  >
                    {valid
                      ? money(
                          state === "refunded" || state === "completed"
                            ? settlement.amount
                            : settlement.merchantAmount,
                        )
                      : "—"}
                  </span>
                  <small>USDC</small>
                </dd>
              </div>
              <div>
                <dt>
                  <i className="legend-dot reserve-dot" />
                  {state === "refunded"
                    ? "Retained from this payment"
                    : "Held in reserve"}
                </dt>
                <dd>
                  <span
                    className="settlement-number"
                    key={`${amount}-${reserveBps}-${state}`}
                  >
                    {valid
                      ? money(finished ? 0n : settlement.reserveAmount)
                      : "—"}
                  </span>
                  <small>USDC</small>
                </dd>
              </div>
            </dl>
            <div className="rate-control">
              <label htmlFor={`${inputId}-rate`}>
                Merchant reserve rate <strong>{reserveBps / 100}%</strong>
              </label>
              <input
                id={`${inputId}-rate`}
                aria-label="Reserve rate"
                type="range"
                min="100"
                max="1000"
                step="100"
                disabled={pending}
                value={reserveBps}
                style={
                  {
                    "--range-progress": `${(reserveBps - 100) / 9}%`,
                  } as React.CSSProperties
                }
                onChange={(event) => {
                  setReserveBps(Number(event.target.value));
                  reset();
                }}
              />
              <div>
                <span>1% · LOWER RESERVE</span>
                <span>10% · HIGHER RESERVE</span>
              </div>
            </div>
            <div className="coverage-note">
              <ShieldCheck size={17} />
              <p>
                <strong>
                  {finished
                    ? "Protection resolved."
                    : `${reserveBps / 100}% retained doesn’t mean ${reserveBps / 100}% protected.`}
                </strong>{" "}
                {finished
                  ? state === "refunded"
                    ? "Existing merchant collateral covers the rest of the refund."
                    : "This order no longer locks merchant collateral."
                  : "Existing merchant collateral backs the rest. Every open order is fully covered."}
              </p>
            </div>
            <div className="resolution-actions">
              {state === "paid" ? (
                <>
                  <button
                    className="button button-outline"
                    disabled={pending || !store.connected}
                    onClick={() =>
                      activeOrder &&
                      void save(() =>
                        store.resolve(activeOrder.id, "completed"),
                      )
                    }
                  >
                    <Check size={15} /> Complete order
                  </button>
                  <button
                    className="text-button"
                    disabled={pending || !store.connected}
                    onClick={() =>
                      activeOrder &&
                      void save(() => store.resolve(activeOrder.id, "refunded"))
                    }
                  >
                    <RotateCcw size={14} /> Issue full refund
                  </button>
                </>
              ) : finished ? (
                <button className="text-button" onClick={reset}>
                  <RotateCcw size={14} /> Try another payment
                </button>
              ) : (
                <span>
                  <ArrowLeftHint /> Simulate a payment to explore what happens
                  next.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="workbench-footer">
        <span>
          <Code2 size={13} /> Powered by the ReservePay settlement SDK
        </span>
        <span>ONE PAYMENT. A CLEAR PAPER TRAIL.</span>
      </div>
      <PaymentHistory onSelect={selectOrder} disabled={pending} />
    </section>
  );
}

function ArrowLeftHint() {
  return <ArrowRight size={14} className="left-hint" />;
}

const steps = [
  {
    icon: Wallet,
    title: "Pay in USDC.",
    text: "A familiar checkout, with a wallet instead of a card. The order’s protection starts here.",
    tag: "BUYER → PAYMENT",
  },
  {
    icon: Zap,
    title: "Keep business moving.",
    text: "Most of the payment goes straight to the merchant. No waiting for the entire order to clear.",
    tag: "PAYMENT → MERCHANT",
  },
  {
    icon: ShieldCheck,
    title: "Let the reserve back it.",
    text: "A small portion joins the merchant’s collateral, with full coverage for every open order.",
    tag: "RESERVE → PROTECTION",
  },
  {
    icon: CheckCheck,
    title: "Deliver. Or make it right.",
    text: "Complete the order to release its reserve. If delivery fails, the resolver can refund the buyer in full.",
    tag: "ORDER → RESOLUTION",
  },
];

const questions = [
  [
    "How can a 5% reserve cover a 100% refund?",
    "Merchants fund collateral before accepting protected payments. The retained portion of each payment adds to that pool. ReservePay checks that the pool can cover every open order in full, and blocks withdrawals that would leave orders undercollateralized.",
  ],
  [
    "Who can issue a refund?",
    "The protocol’s designated resolver can issue a refund from the merchant reserve. Buyers do not automatically receive a refund just by requesting one; the resolver handles the order’s resolution.",
  ],
  [
    "When can merchants withdraw their reserve?",
    "Merchants can withdraw collateral that is not backing open orders. Completing an order releases its locked liability, so more of the reserve can become available.",
  ],
  [
    "Can I use ReservePay for real payments today?",
    "Not yet. This checkout is an interactive simulation and does not submit payment transactions. The merchant dashboard is live on Solana devnet for wallet-signed registration, reserve deposits, and withdrawals. Buyer checkout is still in development.",
  ],
];

export function App() {
  const motionRoot = useScrollReveal();
  return (
    <div id="top" ref={motionRoot}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="page-shell">
        <AppHeader />
        <main id="main">
          <section className="hero section-frame">
            <div className="hero-copy" data-reveal-stagger>
              <a className="hero-kicker" href="#protocol">
                <span className="status-dot" /> THE TRUST LAYER FOR STABLECOINS{" "}
                <ArrowUpRight size={13} />
              </a>
              <h1>
                Good commerce.
                <br />
                Built on <em>trust.</em>
              </h1>
              <p className="hero-lede">
                Get paid now. Keep buyers protected.
                <br />
                Stablecoin payments with a reserve that makes
                <br className="wide-break" /> things right when an order goes
                wrong.
              </p>
              <div className="hero-actions">
                <a className="button button-dark" href="#demo">
                  Try the checkout <ArrowRight size={16} />
                </a>
                <a
                  className="text-button"
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github size={16} /> Explore the code{" "}
                  <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="hero-footnote">
                <span className="solana-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>{" "}
                BUILT ON SOLANA <span className="divider-slash">/</span> SETTLED
                IN USDC
              </div>
            </div>
            <ReserveVisual />
            <div className="hero-index" aria-hidden="true">
              <span>COMMERCE, WITH CONFIDENCE.</span>
              <span>
                SCROLL TO EXPLORE <ArrowDown size={12} />
              </span>
            </div>
          </section>
          <div className="principles-strip" data-reveal-stagger>
            <span>
              <Zap size={16} /> Instant merchant settlement
            </span>
            <span>
              <ShieldCheck size={16} /> Full order coverage
            </span>
            <span>
              <LockKeyhole size={16} /> Reserves enforced on-chain
            </span>
            <span>
              <Code2 size={16} /> Open source by design
            </span>
          </div>
          <section
            className="flow-section section-frame"
            id="how"
            aria-labelledby="flow-title"
          >
            <div className="section-heading" data-reveal>
              <div>
                <SectionLabel number="01">THE PAYMENT FLOW</SectionLabel>
                <h2 id="flow-title">
                  Fast money.
                  <br />
                  <span>A little more peace of mind.</span>
                </h2>
              </div>
              <p>
                Stablecoins move in seconds.
                <br />
                Trust should move with them.
              </p>
            </div>
            <div className="flow-grid" data-reveal-stagger>
              {steps.map((step, index) => (
                <article key={step.title}>
                  <div className="step-top">
                    <step.icon size={21} strokeWidth={1.5} />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <span className="step-tag">{step.tag}</span>
                </article>
              ))}
            </div>
          </section>
          <CheckoutDemo />
          <section
            className="merchant-section section-frame"
            id="merchants"
            aria-labelledby="merchant-title"
          >
            <div className="merchant-copy" data-reveal>
              <SectionLabel number="03">FOR THE MERCHANTS</SectionLabel>
              <h2 id="merchant-title">
                Your revenue.
                <br />
                Not a waiting room.
              </h2>
              <p>
                You did the work. Your cash flow shouldn’t have to wait. Get
                most of every payment upfront, while your reserve gives buyers a
                reason to trust you.
              </p>
              <div className="merchant-points">
                <span>
                  <Check size={15} /> Most of every payment, available
                  immediately
                </span>
                <span>
                  <Check size={15} /> Only open orders lock collateral
                </span>
                <span>
                  <Check size={15} /> Surplus reserve stays withdrawable
                </span>
              </div>
              <a href="#demo" className="text-button">
                See how settlement works <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="merchant-dashboard" data-reveal>
              <div className="dashboard-top">
                <span className="dashboard-avatar">N</span>
                <span>
                  Northstar Studio<small>MERCHANT RESERVE</small>
                </span>
                <span className="demo-badge">EXAMPLE</span>
              </div>
              <div className="balance-label">
                Total reserve <LockKeyhole size={13} />
              </div>
              <div className="reserve-balance">
                $12,500
                <span>
                  .00 <small>USDC</small>
                </span>
              </div>
              <div className="balance-chart">
                <span />
                <span />
              </div>
              <div className="balance-key">
                <span>
                  <i /> Available to withdraw <b>$8,000.00</b>
                </span>
                <span>
                  <i /> Backing open orders <b>$4,500.00</b>
                </span>
              </div>
              <div className="dashboard-bottom">
                <ShieldCheck size={18} />
                <span>Every open order. Fully covered.</span>
                <span>100%</span>
              </div>
            </div>
          </section>
          <section
            className="protocol-section section-frame"
            id="protocol"
            aria-labelledby="protocol-title"
          >
            <div className="protocol-copy" data-reveal>
              <SectionLabel number="04">OPEN BY DESIGN</SectionLabel>
              <h2 id="protocol-title">
                Trust the rules.
                <br />
                <em>Verify the code.</em>
              </h2>
              <p>
                Settlement, reserve coverage, and refunds live in one public
                Solana program. Clear rules for everyone on either side of a
                payment.
              </p>
              <a
                className="button button-outline"
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={16} /> View the source <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="protocol-rules" data-reveal>
              <div className="panel-topline">
                <span>
                  <Code2 size={14} /> THE RESERVE INVARIANT
                </span>
                <span>01—03</span>
              </div>
              <div>
                <span>01</span>
                <p>Every open order is backed.</p>
                <ShieldCheck size={17} />
              </div>
              <div>
                <span>02</span>
                <p>Locked collateral stays locked.</p>
                <LockKeyhole size={17} />
              </div>
              <div>
                <span>03</span>
                <p>Refunds cover the full payment.</p>
                <RotateCcw size={17} />
              </div>
              <p className="protocol-stage">
                <span className="status-dot" /> Devnet preview · Deployed
                on Solana
              </p>
            </div>
          </section>
          <section
            className="faq-section section-frame"
            aria-labelledby="faq-title"
          >
            <div>
              <SectionLabel number="05">A FEW GOOD QUESTIONS</SectionLabel>
              <h2 id="faq-title">
                The details <br />
                matter.
              </h2>
            </div>
            <div className="faq-list" data-reveal>
              {questions.map(([question, answer]) => (
                <details key={question} name="reservepay-faq">
                  <summary>
                    {question}
                    <ChevronDown size={16} />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section
            className="closing-section section-frame"
            data-reveal-stagger
          >
            <span className="section-label">
              BETTER PAYMENTS. BETTER BUSINESS.
            </span>
            <h2>
              A little reserve.
              <br />A lot more <em>confidence.</em>
            </h2>
            <a className="button button-dark" href="#demo">
              Give it a try <ArrowRight size={16} />
            </a>
            <span className="closing-note">
              NO REAL FUNDS. JUST A BETTER WAY TO PAY.
            </span>
          </section>
        </main>
        <footer>
          <div className="footer-main" data-reveal>
            <div>
              <Logo />
              <p>Good commerce starts with trust.</p>
            </div>
            <div className="footer-links">
              <a href="#how">How it works</a>
              <a href="#demo">Try the demo</a>
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                GitHub <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} ReservePay</span>
            <span>
              <span className="status-dot" /> BUILT ON SOLANA
            </span>
            <a href="#top">BACK TO TOP ↑</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
