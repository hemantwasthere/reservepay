import { useEffect, useId, useRef, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  LogOut,
  Wallet,
} from "lucide-react";
import {
  legacyPhantom,
  standardWallet,
  type ConnectedAccount,
  type WalletOption,
} from "./wallets";

import { useToast } from "./Toast";
import {
  readWalletSession,
  rememberWallet,
  walletSessionKey,
} from "./wallet-session";

const shorten = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export type WalletConnection = {
  wallet: WalletOption;
  account: ConnectedAccount;
};

export function WalletControl({
  onChange,
  onLoadingChange,
  locked = false,
}: {
  onChange?: (connection: WalletConnection | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  locked?: boolean;
}) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [active, setActive] = useState<{
    wallet: WalletOption;
    account: ConnectedAccount;
  } | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [panel, setPanel] = useState<"manage" | "choose" | null>(null);
  const [busy, setBusy] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState("");
  const [hint, setHint] = useState("");
  const { notify, dismiss } = useToast();
  const setMessage = (description: string, tone: "info" | "error" = "info") => {
    setHint(tone === "info" ? description : "");
    if (description && tone === "error")
      notify({
        id: "wallet-message",
        title: "Wallet connection",
        description,
        tone,
      });
    else dismiss("wallet-message");
  };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const operation = useRef(0);
  const attempted = useRef(new Set<object>());
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const activeRef = useRef(active);
  const unsubscribe = useRef<() => void>(() => {});
  const panelId = useId();

  useEffect(() => {
    if (!copiedAddress) return;
    const timer = setTimeout(() => setCopiedAddress(""), 2000);
    return () => clearTimeout(timer);
  }, [copiedAddress]);

  useEffect(() => {
    onLoadingChange?.(initializing || busy === "Reconnecting…");
  }, [initializing, busy, onLoadingChange]);

  const close = () => {
    setPanel(null);
    trigger.current?.focus();
  };

  const updateActive = (next: typeof active) => {
    activeRef.current = next;
    setActive(next);
    setCopiedAddress("");
    rememberWallet(
      next ? { name: next.wallet.name, address: next.account.address } : null,
    );
    onChangeRef.current?.(next);
  };

  const adopt = (
    wallet: WalletOption,
    nextAccounts: ConnectedAccount[],
    preferred?: string,
  ) => {
    const account =
      nextAccounts.find((item) => item.address === preferred) ??
      nextAccounts[0];
    if (!account) throw new Error("No Solana account was shared.");
    unsubscribe.current();
    updateActive({ wallet, account });
    setAccounts(nextAccounts);
    unsubscribe.current = wallet.subscribe((updated) => {
      if (activeRef.current?.wallet.identity !== wallet.identity) return;
      setAccounts(updated);
      const next =
        updated.find(
          (item) => item.address === activeRef.current?.account.address,
        ) ?? updated[0];
      updateActive(next ? { wallet, account: next } : null);
      if (!next) {
        setPanel(null);
      }
    });
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
    const discoveryTimer = setTimeout(() => setInitializing(false), 1500);
    return () => {
      clearTimeout(discoveryTimer);
      operation.current++;
      pending.current = false;
      attempted.current.clear();
      register();
      unregister();
      unsubscribe.current();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const saved = readWalletSession();
    if (!saved) setInitializing(false);
    if (!saved || activeRef.current || pending.current) return;
    const wallet = options.find((item) => item.name === saved.name);
    if (!wallet || attempted.current.has(wallet.identity)) return;
    attempted.current.add(wallet.identity);
    const request = ++operation.current;
    pending.current = true;
    setBusy("Reconnecting…");
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Wallet unavailable")), 8000);
    });
    void Promise.race([wallet.reconnect(), timeout])
      .then((next) => {
        if (operation.current === request) adopt(wallet, next, saved.address);
      })
      .catch(() => {
        if (operation.current === request)
          setMessage("Unlock your wallet, then connect to continue.");
      })
      .finally(() => {
        clearTimeout(timer);
        if (operation.current === request) {
          pending.current = false;
          setBusy("");
          setInitializing(false);
        }
      });
  }, [options]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        (event.key === walletSessionKey || event.key === null) &&
        !readWalletSession()
      ) {
        operation.current++;
        pending.current = false;
        setBusy("");
        unsubscribe.current();
        updateActive(null);
        setAccounts([]);
        setPanel(null);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
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
    if (pending.current || locked) return;
    pending.current = true;
    const request = ++operation.current;
    setBusy("Connecting…");
    setMessage("");
    try {
      const nextAccounts = await wallet.connect();
      if (operation.current !== request) return;
      if (!nextAccounts[0]) throw new Error("No Solana account was shared.");
      const previous = activeRef.current;
      adopt(wallet, nextAccounts);
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
      if (operation.current !== request) return;
      setMessage(
        activeRef.current
          ? "Wallet switch cancelled or unavailable. Your current wallet is still connected."
          : "Could not connect. Approve the request in your wallet or try again.",
        "error",
      );
    } finally {
      if (operation.current === request) {
        pending.current = false;
        setBusy("");
        requestAnimationFrame(() => trigger.current?.focus());
      }
    }
  };

  const disconnect = async () => {
    const current = activeRef.current;
    if (!current || pending.current || locked) return;
    pending.current = true;
    setBusy("Disconnecting…");
    setMessage("");
    try {
      await current.wallet.disconnect();
      unsubscribe.current();
      updateActive(null);
      setAccounts([]);
      close();
    } catch {
      setMessage(
        "Could not disconnect. Please try again or disconnect in your wallet.",
        "error",
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
        aria-label={
          active
            ? `Wallet options for ${active.wallet.name}, ${shorten(active.account.address)}`
            : undefined
        }
        aria-keyshortcuts="Alt+Shift+W"
        aria-busy={Boolean(busy) || initializing}
        aria-expanded={Boolean(panel)}
        aria-controls={panelId}
        disabled={Boolean(busy) || initializing || locked}
        onClick={() => {
          dismiss("wallet-message");
          setPanel(panel ? null : active ? "manage" : "choose");
        }}
      >
        {busy || initializing ? (
          <LoaderCircle size={15} className="pending-spinner" />
        ) : active ? (
          <Check size={15} />
        ) : (
          <Wallet size={15} />
        )}
        {busy ||
          (initializing
            ? "Loading wallet…"
            : active
              ? shorten(active.account.address)
              : "Connect wallet")}
        {active && !busy && (
          <ChevronDown size={12} className="wallet-chevron" />
        )}
      </button>
      {panel && (
        <div
          className="wallet-panel"
          id={panelId}
          role="region"
          aria-label="Wallet options"
        >
          {panel === "manage" && active ? (
            <>
              <div className="wallet-panel-heading">
                <span>{active.wallet.name}</span>
                <span className="status-dot">CONNECTED</span>
              </div>
              <p className="wallet-address">{active.account.address}</p>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(active.account.address);
                    dismiss("wallet-copy");
                    setCopiedAddress(active.account.address);
                  } catch {
                    notify({
                      id: "wallet-copy",
                      title: "Could not copy address",
                      description:
                        "Select the address above and copy it manually.",
                      tone: "error",
                    });
                  }
                }}
              >
                {copiedAddress === active.account.address ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                <span aria-live="polite">
                  {copiedAddress === active.account.address
                    ? "Copied"
                    : "Copy address"}
                </span>
              </button>
              <button
                onClick={() => {
                  setMessage("");
                  setPanel("choose");
                }}
                disabled={Boolean(busy) || locked}
              >
                <ArrowLeftRight size={14} /> Switch wallet
              </button>
              <button onClick={disconnect} disabled={Boolean(busy) || locked}>
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
                    disabled={Boolean(busy) || locked}
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
                    Boolean(busy) ||
                    locked ||
                    wallet.identity === active?.wallet.identity
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
          {hint && <p className="wallet-hint">{hint}</p>}
        </div>
      )}
    </div>
  );
}
