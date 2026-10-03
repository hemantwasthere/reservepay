import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound, LoaderCircle } from "lucide-react";
import type { WalletConnection } from "../lib/WalletControl";
import type { MerchantSession } from "../lib/useMerchantSession";

export function SignInCard({
  active,
  session,
}: {
  active: WalletConnection;
  session: MerchantSession;
}) {
  const [busy, setBusy] = useState(false);
  const checking = session.status === "checking";
  const supported = Boolean(active.wallet.signMessage);
  return (
    <Card
      as="section"
      className={
        "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:text-[18px] [&_h2]:tracking-[-0.4px] [&_h2]:leading-[1.5] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] sign-in-card my-[24px]"
      }
      aria-labelledby="sign-in-title"
    >
      <CardHeader
        className={
          "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[light-dark(#91a481,var(--primary))]"
        }
      >
        <div>
          <span
            className={
              "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
            }
          >
            WORKSPACE / SIGN IN
          </span>
          <h2 id="sign-in-title">Sign in to your workspace.</h2>
        </div>
        <KeyRound size={22} aria-hidden="true" />
      </CardHeader>
      <p
        className={
          "payment-intro text-muted-foreground text-[12px] leading-[1.7] [margin:10px_0_24px]"
        }
      >
        Approve a message with your wallet to manage your profile and payment
        links. This signature does not transfer funds.
      </p>
      <Button
        variant="brand"
        size="unstyled"
        className={"button button-green"}
        disabled={!supported || busy || checking}
        onClick={() => {
          setBusy(true);
          void session.signIn().finally(() => setBusy(false));
        }}
      >
        {busy || checking ? (
          <LoaderCircle
            size={16}
            className={
              "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
            }
          />
        ) : (
          <KeyRound size={16} />
        )}
        {busy
          ? "Check your wallet…"
          : checking
            ? "Checking session…"
            : "Sign in with your wallet"}
      </Button>
      {!supported && (
        <p
          className={
            "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          This wallet does not support message signing. Switch to a wallet such
          as Phantom to sign in.
        </p>
      )}
    </Card>
  );
}
