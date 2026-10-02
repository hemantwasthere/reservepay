import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
  onSignOut,
  locked = false,
}: {
  onChange?: (connection: WalletConnection | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  onSignOut?: () => void;
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
      try {
        onSignOut?.();
      } catch {}
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
    <Popover
      open={Boolean(panel)}
      onOpenChange={(open) =>
        setPanel(open ? (active ? "manage" : "choose") : null)
      }
    >
      <div
        className={"wallet-wrap relative"}
        ref={wrap}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
            setMessage("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ink"
            size="unstyled"
            ref={trigger}
            className={
              'button button-dark wallet-button min-h-[37px] text-[11px] px-[14px] gap-[8px] max-[700px]:text-[10px] max-[700px]:min-h-[34px] max-[700px]:py-0 max-[700px]:px-[10px] max-[700px]:[&_svg]:w-[13px] [&[aria-expanded="true"]_.wallet-chevron]:[transform:rotate(180deg)]'
            }
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
            }}
          >
            {busy || initializing ? (
              <LoaderCircle
                size={15}
                className={
                  "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                }
              />
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
              <ChevronDown
                size={12}
                className={"wallet-chevron [transition:transform_180ms_ease]"}
              />
            )}
          </Button>
        </PopoverTrigger>
        {panel && (
          <PopoverContent
            align="end"
            sideOffset={10}
            className={
              "wallet-panel p-[10px] z-[30] bg-background [border:1px_solid_var(--line)] shadow-[0_12px_30px_#24282012] rounded-[6px] animate-[feedback-in_180ms_var(--ease-settle)_both] [&_button]:flex [&_button]:items-center [&_button]:justify-start [&_button]:gap-[10px] [&_button]:w-[100%] [&_button]:p-[8px] [&_button]:[border:0] [&_button]:bg-transparent [&_button]:text-foreground [&_button]:[font:12px_var(--font-sans)] [&_button]:text-left [&_button]:[transition:background-color_180ms_ease] [&_button]:min-h-[42px] [&_button]:rounded-[3px] [&_button:not(:disabled):hover]:bg-[#e8eddf] [&_button:disabled]:opacity-[0.5] [&_button:disabled]:cursor-default [&_button>span+svg]:ml-auto [&_.wallet-back]:w-[24px] [&_.wallet-back]:min-h-[24px] [&_.wallet-back]:p-0 [&_.wallet-message]:static [&_.wallet-message]:w-[auto] [&_.wallet-message]:mt-[8px] [&_.wallet-message]:py-[10px] [&_.wallet-message]:px-[8px] [&_.wallet-message]:[border:0] [&_.wallet-message]:[border-top:1px_solid_var(--line)] [&_.wallet-message]:shadow-[none] [&_.wallet-message]:bg-transparent [&_.wallet-message]:text-[11px] [&_.wallet-message_button]:w-[auto] [&_.wallet-message_button]:min-h-[auto] [&_.wallet-message_button]:p-0 [&_button:has(.lucide-log-out)]:[color:var(--danger)] max-[640px]:max-w-[calc(100vw_-_34px)] relative top-auto right-auto w-[min(340px,calc(100vw-32px))]"
            }
            id={panelId}
            aria-label="Wallet options"
          >
            {panel === "manage" && active ? (
              <>
                <div
                  className={
                    "wallet-panel-heading flex items-center gap-[8px] py-[9px] px-[8px] text-muted-foreground [font:9px_var(--mono)] tracking-[0.5px] [&_.status-dot]:ml-auto [&_.status-dot]:text-[7px]"
                  }
                >
                  <span>{active.wallet.name}</span>
                  <span
                    className={
                      'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185]'
                    }
                  >
                    CONNECTED
                  </span>
                </div>
                <p
                  className={
                    "wallet-address [margin:0_8px_10px] pb-[14px] [border-bottom:1px_solid_var(--line)] [font:10px/1.7_var(--mono)] [overflow-wrap:anywhere] text-muted-foreground"
                  }
                >
                  {active.account.address}
                </p>
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        active.account.address,
                      );
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
                </Button>
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={() => {
                    setMessage("");
                    setPanel("choose");
                  }}
                  disabled={Boolean(busy) || locked}
                >
                  <ArrowLeftRight size={14} /> Switch wallet
                </Button>
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={disconnect}
                  disabled={Boolean(busy) || locked}
                >
                  <LogOut size={14} /> Disconnect
                </Button>
              </>
            ) : (
              <>
                <div
                  className={
                    "wallet-panel-heading flex items-center gap-[8px] py-[9px] px-[8px] text-muted-foreground [font:9px_var(--mono)] tracking-[0.5px] [&_.status-dot]:ml-auto [&_.status-dot]:text-[7px]"
                  }
                >
                  {active ? (
                    <Button
                      variant="unstyled"
                      size="unstyled"
                      className={"wallet-back"}
                      aria-label="Back to wallet options"
                      onClick={() => setPanel("manage")}
                    >
                      <ArrowLeft size={13} />
                    </Button>
                  ) : (
                    <Wallet size={13} />
                  )}
                  <span>{active ? "SWITCH WALLET" : "CHOOSE WALLET"}</span>
                </div>
                {active &&
                  accounts.length > 1 &&
                  accounts.map((account) => (
                    <Button
                      variant="unstyled"
                      size="unstyled"
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
                    </Button>
                  ))}
                {options.map((wallet, index) => (
                  <Button
                    variant="unstyled"
                    size="unstyled"
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
                      <span
                        className={
                          "wallet-detected ml-auto [font:7px_var(--mono)] text-muted-foreground"
                        }
                      >
                        DETECTED
                      </span>
                    )}
                  </Button>
                ))}
                {!options.length && (
                  <p
                    className={
                      "wallet-hint [margin:10px_8px_5px] text-[11px] leading-[1.6] text-muted-foreground [&_a]:underline [&_a]:text-primary"
                    }
                  >
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
                  <p
                    className={
                      "wallet-hint [margin:10px_8px_5px] text-[11px] leading-[1.6] text-muted-foreground [&_a]:underline [&_a]:text-primary"
                    }
                  >
                    For another account in {active.wallet.name}, switch inside
                    your wallet. Your address updates here automatically.
                  </p>
                )}
              </>
            )}
            {hint && (
              <p
                className={
                  "wallet-hint [margin:10px_8px_5px] text-[11px] leading-[1.6] text-muted-foreground [&_a]:underline [&_a]:text-primary"
                }
              >
                {hint}
              </p>
            )}
          </PopoverContent>
        )}
      </div>
    </Popover>
  );
}
