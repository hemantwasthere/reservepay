import { useEffect, useId, useRef, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  LoaderCircle,
  LogOut,
  Wallet,
  X,
} from "lucide-react";
import {
  legacyPhantom,
  standardWallet,
  type ConnectedAccount,
  type WalletOption,
} from "./wallets";

const shorten = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export function WalletControl() {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [active, setActive] = useState<{
    wallet: WalletOption;
    account: ConnectedAccount;
  } | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [panel, setPanel] = useState<"manage" | "choose" | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const activeRef = useRef(active);
  const unsubscribe = useRef<() => void>(() => {});
  const panelId = useId();

  const close = () => {
    setPanel(null);
    trigger.current?.focus();
  };

  const updateActive = (next: typeof active) => {
    activeRef.current = next;
    setActive(next);
  };

  useEffect(() => {
    const registry = getWallets();
    const refresh = () => {
      const wallets = registry
        .get()
        .map(standardWallet)
        .filter((wallet) => wallet !== null);
      const phantom = legacyPhantom();
      if (phantom && !wallets.some((wallet) => wallet.name === "Phantom"))
        wallets.push(phantom);
      setOptions(wallets);
    };
    refresh();
    const register = registry.on("register", refresh);
    const unregister = registry.on("unregister", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      register();
      unregister();
      unsubscribe.current();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!panel) return;
    wrap.current
      ?.querySelector<HTMLElement>(
        ".wallet-panel button:not(:disabled), .wallet-panel a",
      )
      ?.focus();
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !wrap.current?.contains(event.target))
        setPanel(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, [panel]);

  const connect = async (wallet: WalletOption) => {
    if (pending.current) return;
    pending.current = true;
    setBusy("Connecting…");
    setMessage("");
    try {
      const nextAccounts = await wallet.connect();
      if (!nextAccounts[0]) throw new Error("No Solana account was shared.");
      const previous = activeRef.current;
      unsubscribe.current();
      updateActive({ wallet, account: nextAccounts[0] });
      setAccounts(nextAccounts);
      unsubscribe.current = wallet.subscribe((updated) => {
        if (activeRef.current?.wallet.identity !== wallet.identity) return;
        setAccounts(updated);
        const account =
          updated.find(
            (item) => item.address === activeRef.current?.account.address,
          ) ?? updated[0];
        updateActive(account ? { wallet, account } : null);
        if (!account) {
          setPanel(null);
          setMessage(
            "Wallet disconnected. Connect again to use your new account.",
          );
        }
      });
      close();
      if (
        previous &&
        previous.wallet.identity !== wallet.identity &&
        previous.wallet.name !== wallet.name
      ) {
        try {
          await previous.wallet.disconnect();
        } catch {
          setMessage(
            `Switched to ${wallet.name}. You can disconnect ${previous.wallet.name} from its connected apps settings.`,
          );
        }
      }
    } catch {
      setMessage(
        activeRef.current
          ? "Wallet switch cancelled or unavailable. Your current wallet is still connected."
          : "Could not connect. Approve the request in your wallet or try again.",
      );
    } finally {
      pending.current = false;
      setBusy("");
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };

  const disconnect = async () => {
    const current = activeRef.current;
    if (!current || pending.current) return;
    pending.current = true;
    setBusy("Disconnecting…");
    setMessage("");
    try {
      await current.wallet.disconnect();
      unsubscribe.current();
      updateActive(null);
      setAccounts([]);
      setMessage("");
      close();
    } catch {
      setMessage(
        "Could not disconnect. Please try again or disconnect in your wallet.",
      );
    } finally {
      pending.current = false;
      setBusy("");
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };

  return (
    <div
      className="wallet-wrap"
      ref={wrap}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
          setMessage("");
        }
      }}
    >
      <button
        ref={trigger}
        className="button button-dark wallet-button"
        aria-expanded={Boolean(panel)}
        aria-controls={panelId}
        disabled={Boolean(busy)}
        onClick={() => {
          setMessage("");
          setPanel(panel ? null : active ? "manage" : "choose");
        }}
      >
        {busy ? (
          <LoaderCircle size={15} className="pending-spinner" />
        ) : active ? (
          <Check size={15} />
        ) : (
          <Wallet size={15} />
        )}
        {busy || (active ? shorten(active.account.address) : "Connect wallet")}
        {active && !busy && (
          <ChevronDown size={12} className="wallet-chevron" />
        )}
      </button>
      {panel && (
        <div className="wallet-panel" id={panelId} aria-label="Wallet options">
          {panel === "manage" && active ? (
            <>
              <div className="wallet-panel-heading">
                <span>{active.wallet.name}</span>
                <span className="status-dot">CONNECTED</span>
              </div>
              <p className="wallet-address">{active.account.address}</p>
              <button
                onClick={() => {
                  setMessage("");
                  setPanel("choose");
                }}
                disabled={Boolean(busy)}
              >
                <ArrowLeftRight size={14} /> Switch wallet
              </button>
              <button onClick={disconnect} disabled={Boolean(busy)}>
                <LogOut size={14} /> Disconnect
              </button>
            </>
          ) : (
            <>
              <div className="wallet-panel-heading">
                {active ? (
                  <button
                    className="wallet-back"
                    aria-label="Back to wallet options"
                    onClick={() => setPanel("manage")}
                  >
                    <ArrowLeft size={13} />
                  </button>
                ) : (
                  <Wallet size={13} />
                )}
                <span>{active ? "SWITCH WALLET" : "CHOOSE WALLET"}</span>
              </div>
              {active &&
                accounts.length > 1 &&
                accounts.map((account) => (
                  <button
                    key={account.address}
                    disabled={Boolean(busy)}
                    onClick={() => {
                      updateActive({ wallet: active.wallet, account });
                      close();
                    }}
                  >
                    <span>{account.label ?? shorten(account.address)}</span>
                    {account.address === active.account.address && (
                      <Check size={13} />
                    )}
                  </button>
                ))}
              {options.map((wallet, index) => (
                <button
                  key={`${wallet.name}-${index}`}
                  onClick={() => connect(wallet)}
                  disabled={
                    Boolean(busy) || wallet.identity === active?.wallet.identity
                  }
                >
                  <Wallet size={14} />
                  <span>{wallet.name}</span>
                  {wallet.identity === active?.wallet.identity ? (
                    <Check size={13} />
                  ) : (
                    <span className="wallet-detected">DETECTED</span>
                  )}
                </button>
              ))}
              {!options.length && (
                <p className="wallet-hint">
                  No Solana wallet detected. Open this page in your wallet’s
                  browser, or install{" "}
                  <a
                    href="https://phantom.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Phantom
                  </a>
                  .
                </p>
              )}
              {active && (
                <p className="wallet-hint">
                  For another account in {active.wallet.name}, switch inside
                  your wallet. Your address updates here automatically.
                </p>
              )}
            </>
          )}
          {message && (
            <div className="wallet-message" role="status">
              {message}
              <button
                aria-label="Dismiss wallet message"
                onClick={() => setMessage("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>
      )}
      {!panel && message && (
        <div className="wallet-message" role="status">
          {message}
          <button
            aria-label="Dismiss wallet message"
            onClick={() => setMessage("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
