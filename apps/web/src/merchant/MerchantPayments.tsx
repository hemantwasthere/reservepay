import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { LoaderCircle, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefundQueue } from "../payments/RefundQueue";
import { PaymentLinks } from "../payments/PaymentLinks";
import type { WalletConnection } from "../lib/WalletControl";
import { client, type MerchantState } from "./client";
export function MerchantPayments({
  active,
  walletLoading,
  locked,
  setLocked,
  isCurrent,
}: {
  active: WalletConnection | null;
  walletLoading: boolean;
  locked: boolean;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
}) {
  const [state, setState] = useState<MerchantState | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      const next = await client.read(new PublicKey(active.account.address));
      if (mounted.current && isCurrent(active)) {
        setState(next);
        setError("");
      }
    } catch {
      if (mounted.current && isCurrent(active))
        setError("Could not load your merchant account. Please try again.");
    }
  }, [active, isCurrent]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
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
      <RefundQueue active={active} />
      <PaymentLinks
        active={active}
        registered={Boolean(state?.registered && state.ready)}
        locked={locked}
        setLocked={setLocked}
        isCurrent={isCurrent}
        onPaid={() => void refresh()}
      />
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
