import { LoaderCircle, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentLinks } from "../payments/PaymentLinks";
import { useResolver } from "../payments/useResolver";
import { SignInCard } from "./SignInCard";
import type { WalletConnection } from "../lib/WalletControl";
import type { MerchantSession } from "../lib/useMerchantSession";
import { type MerchantState } from "./client";

// One-line pointer to the resolver's own page. UI gating only: the on-chain
// resolver constraint gates decisions, and the dispute queue is public.
function DisputesLink({ active }: { active: WalletConnection | null }) {
  const { resolver } = useResolver();
  if (!active || !resolver || active.account.address !== resolver) return null;
  return (
    <p className="my-4 text-xs leading-6 text-muted-foreground">
      You are the protocol resolver.{" "}
      <a
        className="text-primary underline underline-offset-4"
        href="/app/disputes"
      >
        Review refund requests
      </a>
      .
    </p>
  );
}

export function MerchantPayments({
  state,
  error,
  refresh,
  active,
  session,
  walletLoading,
  locked,
  setLocked,
  isCurrent,
}: {
  state: MerchantState | null;
  error: string;
  refresh: () => void;
  active: WalletConnection | null;
  session: MerchantSession;
  walletLoading: boolean;
  locked: boolean;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
}) {
  if (walletLoading || (active && !state && !error))
    return (
      <Card className={"p-8"} role="status">
        <div
          className={"flex items-center gap-3 text-sm text-muted-foreground"}
        >
          <LoaderCircle className={"size-4 animate-spin"} />
          Loading your payment workspace…
        </div>
      </Card>
    );
  if (error)
    return (
      <Card className={"p-6"}>
        <p role="alert" className={"mb-4 text-sm text-destructive"}>
          {error}
        </p>
        <Button variant="outline" onClick={() => void refresh()}>
          Try again
        </Button>
      </Card>
    );
  return (
    <>
      <DisputesLink active={active} />
      {active && session.status !== "signed-in" ? (
        <SignInCard active={active} session={session} />
      ) : (
        <PaymentLinks
          active={active}
          session={session.token}
          onSessionExpired={session.expire}
          registered={Boolean(state?.registered && state.ready)}
          locked={locked}
          setLocked={setLocked}
          isCurrent={isCurrent}
          onPaid={() => void refresh()}
        />
      )}
      {active && !state?.registered && (
        <Button asChild variant="outline" className={"mt-4"}>
          <a href="/app">
            Set up your merchant reserve <ArrowUpRight className={"size-4"} />
          </a>
        </Button>
      )}
    </>
  );
}
