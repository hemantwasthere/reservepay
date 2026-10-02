import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import bs58 from "bs58";
import { api } from "../../convex/_generated/api";
import type { WalletConnection } from "./WalletControl";
import { readSession, rememberSession } from "./merchant-session";
import { signInMessage } from "./sign-in";
import { useToast } from "./Toast";
import { paymentsConfigured } from "../payments/PaymentProvider";

export type MerchantSessionStatus = "signed-out" | "checking" | "signed-in";
export type MerchantSession = {
  status: MerchantSessionStatus;
  token: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  expire: () => void;
};

// Convex hooks need the provider from PaymentProvider, which only exists when
// the deployment URL is configured. The gate keeps the workspace renderable
// (and server-renderable) without it.
export function MerchantSessionGate({
  active,
  children,
}: {
  active: WalletConnection | null;
  children: (session: MerchantSession) => ReactNode;
}) {
  const { notify } = useToast();
  const unavailable = useMemo<MerchantSession>(
    () => ({
      status: "signed-out",
      token: null,
      signIn: async () => {
        notify({
          title: "Sign-in unavailable",
          description:
            "Payment service is not configured for this deployment.",
          tone: "error",
        });
      },
      signOut: async () => {},
      expire: () => {},
    }),
    [notify],
  );
  return paymentsConfigured ? (
    <ConfiguredSession active={active}>{children}</ConfiguredSession>
  ) : (
    children(unavailable)
  );
}

function ConfiguredSession({
  active,
  children,
}: {
  active: WalletConnection | null;
  children: (session: MerchantSession) => ReactNode;
}) {
  return children(useMerchantSession(active));
}

function useMerchantSession(active: WalletConnection | null): MerchantSession {
  const address = active?.account.address ?? null;
  const [stored, setStored] = useState<{
    address: string;
    token: string;
  } | null>(null);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const { notify } = useToast();
  const requestNonce = useMutation(api.auth.requestNonce);
  const signInAction = useAction(api.authActions.signIn);
  const signOutMutation = useMutation(api.auth.signOut);

  // Each wallet keeps its own token; switching wallets swaps the session. The
  // token is stored with its address so a stale token from the previous
  // wallet is never paired with the new one, not even for one render.
  useEffect(() => {
    setStored(() => {
      if (!address) return null;
      const token = readSession(address)?.token ?? null;
      return token ? { address, token } : null;
    });
  }, [address]);

  const token = stored && stored.address === address ? stored.token : null;

  // Track the connected wallet across in-flight sign-ins.
  const addressRef = useRef(address);
  addressRef.current = address;

  const me = useQuery(api.auth.me, token ? { session: token } : "skip");

  // The server rejected or expired the stored token.
  useEffect(() => {
    if (address && token && me === null) {
      rememberSession(address, null);
      setStored(null);
    }
  }, [address, token, me]);

  const status: MerchantSessionStatus =
    !address || !token ? "signed-out" : me ? "signed-in" : "checking";

  const signIn = useCallback(async () => {
    // In-flight sign-ins are tracked per wallet, so switching wallets never
    // blocks the newly connected wallet's own sign-in.
    if (!active || !address || !active.wallet.signMessage) return;
    if (busyAddress === address) return;
    setBusyAddress(address);
    const stillConnected = () => addressRef.current === address;
    try {
      const challenge = await requestNonce({ wallet: address });
      const message = signInMessage({
        ...challenge,
        wallet: address,
        domain: window.location.host,
      });
      let signature: string;
      try {
        signature = bs58.encode(
          await active.wallet.signMessage(address, message),
        );
      } catch {
        if (stillConnected())
          notify({
            title: "Sign-in cancelled",
            description:
              "Approve the sign-in message in your wallet to continue.",
            tone: "info",
          });
        return;
      }
      const session = await signInAction({
        ...challenge,
        wallet: address,
        domain: window.location.host,
        signature,
      });
      // The session is stored under the signing wallet either way, but only
      // becomes active if that wallet is still connected.
      rememberSession(address, session);
      if (stillConnected()) setStored({ address, token: session.token });
    } catch (error) {
      if (stillConnected())
        notify({
          title: "Could not sign in",
          description:
            error instanceof ConvexError && typeof error.data === "string"
              ? error.data
              : error instanceof Error
                ? error.message
                : "Try again in a moment.",
          tone: "error",
        });
    } finally {
      setBusyAddress((current) => (current === address ? null : current));
    }
  }, [active, address, busyAddress, requestNonce, signInAction, notify]);

  const expire = useCallback(() => {
    if (!address) return;
    rememberSession(address, null);
    setStored(null);
  }, [address]);

  const signOut = useCallback(async () => {
    if (!address || !token) return;
    rememberSession(address, null);
    setStored(null);
    try {
      await signOutMutation({ session: token });
    } catch {}
  }, [address, token, signOutMutation]);

  return {
    status,
    token: status === "signed-in" ? token : null,
    signIn,
    signOut,
    expire,
  };
}

export const isExpiredSessionError = (error: unknown) =>
  error instanceof Error && error.message.includes("Sign in again");

// Session-gated queries throw when the session expires. Catch that, expire
// the session, and let the parent render the signed-out UI. Any other error
// goes to the fallback (or the next outer boundary) so a real failure never
// renders as a silent blank page. Resets when the token changes.
export class SessionErrorBoundary extends Component<
  {
    resetKey: unknown;
    onExpire: () => void;
    children: ReactNode;
    fallback?: (error: Error, retry: () => void) => ReactNode;
  },
  { error: Error | null; resetKey: unknown }
> {
  state = { error: null, resetKey: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(
    props: { resetKey: unknown },
    state: { resetKey: unknown },
  ) {
    return props.resetKey !== state.resetKey
      ? { error: null, resetKey: props.resetKey }
      : null;
  }
  componentDidCatch(error: unknown) {
    if (isExpiredSessionError(error)) this.props.onExpire();
  }
  retry = () => this.setState({ error: null });
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (isExpiredSessionError(error)) return null;
    if (this.props.fallback) return this.props.fallback(error, this.retry);
    throw error;
  }
}
