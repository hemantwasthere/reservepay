import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { calculateSettlement, formatUsdc } from "@reservepay/core";

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

type DemoState = "ready" | "paid" | "refunded";

const protectionDays = 7;

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="ReservePay home">
      <span className="brand-mark">
        <ShieldCheck size={19} strokeWidth={2.4} />
      </span>
      <span>ReservePay</span>
    </a>
  );
}

function CheckoutDemo() {
  const [amount, setAmount] = useState(100);
  const [reserveBps, setReserveBps] = useState(500);
  const [state, setState] = useState<DemoState>("ready");
  const cents = BigInt(Math.max(1, Math.round(amount * 1_000_000)));
  const settlement = useMemo(
    () => calculateSettlement(cents, reserveBps),
    [cents, reserveBps],
  );

  const pay = () => setState("paid");
  const refund = () => setState("refunded");
  const reset = () => setState("ready");

  return (
    <div className="checkout-shell" id="demo">
      <div className="checkout-topline">
        <div>
          <span className="eyebrow">LIVE CHECKOUT</span>
          <p>From Northstar Studio</p>
        </div>
        <span className="network">
          <i /> Solana
        </span>
      </div>

      <div className="product-row">
        <div className="product-art">
          <Sparkles size={26} />
        </div>
        <div>
          <strong>Creator Launch Kit</strong>
          <span>Templates, assets and lifetime updates</span>
        </div>
      </div>

      <label className="amount-control">
        <span>Order total</span>
        <span className="amount-input">
          <b>$</b>
          <input
            aria-label="Order amount"
            min="1"
            max="10000"
            step="1"
            type="number"
            value={amount}
            onChange={(event) => {
              setAmount(Number(event.target.value) || 1);
              setState("ready");
            }}
          />
          <em>USDC</em>
        </span>
      </label>

      <div className="protection-card">
        <ShieldCheck size={20} />
        <div>
          <strong>Protected for {protectionDays} days</strong>
          <span>Full refund if the product is not delivered</span>
        </div>
        <Check size={17} />
      </div>

      {state === "ready" && (
        <button className="checkout-button" onClick={pay}>
          Pay ${amount.toFixed(2)} <ChevronRight size={18} />
        </button>
      )}

      {state === "paid" && (
        <div className="result-card paid">
          <div className="result-title">
            <Check size={18} /> Payment settled
          </div>
          <div className="settlement-row">
            <span>Merchant received</span>
            <b>${formatUsdc(settlement.merchantAmount)}</b>
          </div>
          <div className="settlement-row">
            <span>Protected reserve</span>
            <b>${formatUsdc(settlement.reserveAmount)}</b>
          </div>
          <button className="refund-button" onClick={refund}>
            <RotateCcw size={16} /> Issue full refund
          </button>
        </div>
      )}

      {state === "refunded" && (
        <div className="result-card refunded">
          <div className="result-title">
            <RotateCcw size={18} /> Refund complete
          </div>
          <p>
            ${amount.toFixed(2)} USDC returned to the buyer from the reserve
            pool.
          </p>
          <button className="text-button" onClick={reset}>
            Run demo again
          </button>
        </div>
      )}

      <div className="rate-control">
        <div>
          <span>Merchant reserve rate</span>
          <b>{reserveBps / 100}%</b>
        </div>
        <input
          aria-label="Reserve rate"
          min="100"
          max="1000"
          step="100"
          type="range"
          value={reserveBps}
          onChange={(event) => {
            setReserveBps(Number(event.target.value));
            setState("ready");
          }}
        />
        <small>Trusted merchants earn lower rates over time</small>
      </div>
    </div>
  );
}

function AppHeader() {
  const [wallet, setWallet] = useState("");
  const [message, setMessage] = useState("");

  const connect = async () => {
    if (!window.solana) {
      setMessage("Install Phantom to connect");
      return;
    }

    try {
      const response = await window.solana.connect();
      setWallet(response.publicKey.toString());
      setMessage("");
    } catch {
      setMessage("Connection cancelled");
    }
  };

  return (
    <header className="site-header">
      <Logo />
      <nav>
        <a href="#how">How it works</a>
        <a href="#merchants">For merchants</a>
        <a href="#protocol">Protocol</a>
      </nav>
      <div className="wallet-wrap">
        <button className="wallet-button" onClick={connect}>
          <Wallet size={16} />{" "}
          {wallet ? shortAddress(wallet) : "Connect wallet"}
        </button>
        {message && <span className="wallet-message">{message}</span>}
      </div>
    </header>
  );
}

export function App() {
  return (
    <main id="top">
      <AppHeader />

      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">
            <span>Built on Solana</span>
            <i /> Buyer protection without escrow
          </div>
          <h1>Stablecoin payments people can trust.</h1>
          <p className="hero-lede">
            Merchants get paid now. Buyers stay protected. ReservePay brings
            card-like refunds to USDC without freezing every payment.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#demo">
              Try the checkout <ArrowDown size={17} />
            </a>
            <a className="secondary-link" href="#protocol">
              Explore the protocol <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="proof-row">
            <div>
              <strong>Instant</strong>
              <span>merchant settlement</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>refund coverage</span>
            </div>
            <div>
              <strong>&lt; 1%</strong>
              <span>target fee</span>
            </div>
          </div>
        </div>
        <CheckoutDemo />
      </section>

      <section className="flow-section" id="how">
        <div className="section-heading">
          <span className="eyebrow">THE PAYMENT FLOW</span>
          <h2>Protection that does not punish good merchants.</h2>
        </div>
        <div className="flow-grid">
          <article>
            <span className="step-number">01</span>
            <div className="icon-box">
              <Wallet size={22} />
            </div>
            <h3>Buyer pays in USDC</h3>
            <p>
              One wallet approval. No account, card number or bank redirect.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <div className="icon-box">
              <Zap size={22} />
            </div>
            <h3>Merchant gets paid</h3>
            <p>Most of the payment settles immediately so cash keeps moving.</p>
          </article>
          <article>
            <span className="step-number">03</span>
            <div className="icon-box">
              <LockKeyhole size={22} />
            </div>
            <h3>A reserve backs the order</h3>
            <p>
              Merchant collateral covers every open order through its protection
              window.
            </p>
          </article>
          <article>
            <span className="step-number">04</span>
            <div className="icon-box">
              <Clock3 size={22} />
            </div>
            <h3>Complete or refund</h3>
            <p>
              Clean orders release reserves. Failed delivery returns the full
              payment.
            </p>
          </article>
        </div>
      </section>

      <section className="merchant-section" id="merchants">
        <div className="merchant-card">
          <div className="merchant-copy">
            <span className="eyebrow light">MERCHANT RESERVE</span>
            <h2>Cash flow on day one. Better terms as trust grows.</h2>
            <p>
              Each completed order builds a public payment history. Reliable
              merchants can earn lower reserve rates while buyers keep the same
              protection.
            </p>
            <div className="merchant-points">
              <span>
                <Check size={15} /> Full reserve coverage enforced on-chain
              </span>
              <span>
                <Check size={15} /> Surplus stays withdrawable
              </span>
              <span>
                <Check size={15} /> Resolution history is portable
              </span>
            </div>
          </div>
          <div className="trust-card">
            <div className="trust-top">
              <span>Northstar Studio</span>
              <b>Strong</b>
            </div>
            <div className="score-ring">
              <strong>86</strong>
              <span>Trust score</span>
            </div>
            <div className="score-stats">
              <div>
                <span>Reserve rate</span>
                <b>5.0%</b>
              </div>
              <div>
                <span>Completed</span>
                <b>148</b>
              </div>
              <div>
                <span>Refunded</span>
                <b>2</b>
              </div>
            </div>
            <div className="score-foot">
              <i />
              <span>Eligible for 3% after 52 clean orders</span>
            </div>
          </div>
        </div>
      </section>

      <section className="protocol-section" id="protocol">
        <div>
          <span className="eyebrow">SOLANA PROGRAM</span>
          <h2>Simple rules. Verifiable money.</h2>
        </div>
        <p>
          ReservePay keeps settlement, liability and refunds in one public
          program. Every open order is fully covered before payment clears.
        </p>
        <a
          href="https://github.com/hemantwasthere/reservepay"
          target="_blank"
          rel="noreferrer"
        >
          View source <ArrowUpRight size={16} />
        </a>
      </section>

      <footer>
        <Logo />
        <span>Protected stablecoin commerce on Solana.</span>
        <span>2026</span>
      </footer>
    </main>
  );
}
