import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Store, LoaderCircle, Check } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";
import type { WalletConnection } from "../lib/WalletControl";
import {
  SessionErrorBoundary,
  type MerchantSession,
} from "../lib/useMerchantSession";
import { useToast } from "../lib/Toast";
import { SignInCard } from "./SignInCard";
import { validateProfile } from "./profile";

export function MerchantProfile({
  active,
  session,
  walletLoading,
}: {
  active: WalletConnection | null;
  session: MerchantSession;
  walletLoading: boolean;
}) {
  if (walletLoading)
    return (
      <Card className={"p-8"} role="status">
        <div
          className={"flex items-center gap-3 text-sm text-muted-foreground"}
        >
          <LoaderCircle className={"size-4 animate-spin"} />
          Checking your wallet connection…
        </div>
      </Card>
    );
  if (!active)
    return (
      <Card className={"p-8"}>
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[#f6f7f2] [border:1px_dashed_var(--line)] rounded-[4px] leading-[1.7]"
          }
        >
          Connect your wallet to manage your merchant profile.
        </div>
      </Card>
    );
  if (session.status !== "signed-in" || !session.token)
    return <SignInCard active={active} session={session} />;
  return (
    <SessionErrorBoundary
      resetKey={session.token}
      onExpire={session.expire}
      fallback={(error, retry) => (
        <Card className={"p-6"}>
          <p role="alert" className={"mb-4 text-sm text-destructive"}>
            Your profile could not load. {error.message}
          </p>
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        </Card>
      )}
    >
      <ProfileForm token={session.token} onExpire={session.expire} />
    </SessionErrorBoundary>
  );
}

function ProfileForm({
  token,
  onExpire,
}: {
  token: string;
  onExpire: () => void;
}) {
  const { notify } = useToast();
  const save = useMutation(api.merchants.save);
  const profile = useQuery(api.merchants.me, { session: token });
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || profile === undefined || profile === null) return;
    filled.current = true;
    setDisplayName(profile.displayName);
    setWebsite(profile.website ?? "");
    setContactEmail(profile.contactEmail ?? "");
    setDescription(profile.description ?? "");
  }, [profile]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const clean = validateProfile({
        displayName,
        website,
        contactEmail,
        description,
      });
      await save({ session: token, profile: clean });
      notify({
        title: "Profile saved",
        description: "Buyers now see your name on checkout.",
        tone: "success",
      });
    } catch (cause) {
      const message =
        cause instanceof ConvexError && typeof cause.data === "string"
          ? cause.data
          : cause instanceof Error
            ? cause.message
            : "Could not save your profile.";
      if (message.includes("Sign in again")) onExpire();
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      as="section"
      className={
        "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:text-[18px] [&_h2]:tracking-[-0.4px] [&_h2]:leading-[1.5] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] profile-card"
      }
      aria-labelledby="profile-title"
    >
      <CardHeader
        className={
          "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[#91a481]"
        }
      >
        <div>
          <span
            className={
              "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
            }
          >
            MERCHANT / PROFILE
          </span>
          <h2 id="profile-title">Who are buyers paying?</h2>
        </div>
        <Store size={22} aria-hidden="true" />
      </CardHeader>
      <p
        className={
          "payment-intro text-muted-foreground text-[12px] leading-[1.7] [margin:10px_0_24px]"
        }
      >
        Your display name and website appear on every checkout. Your contact
        email stays private.
      </p>
      {profile === undefined ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[#f6f7f2] [border:1px_dashed_var(--line)] rounded-[4px] leading-[1.7]"
          }
          role="status"
        >
          Loading your profile…
        </div>
      ) : (
        <form
          className={
            "profile-form grid gap-[16px] [&_label]:flex [&_label]:flex-col [&_label]:gap-[9px] [&_label]:text-[12px] [&_label]:text-muted-foreground [&_input]:w-[100%] [&_input]:min-w-[0] [&_input]:min-h-[44px] [&_input]:py-[11px] [&_input]:px-[12px] [&_input]:[border:1px_solid_var(--line)] [&_input]:rounded-[4px] [&_input]:bg-card [&_input]:text-foreground [&_input]:[font:inherit] [&_textarea]:w-[100%] [&_textarea]:min-w-[0] [&_textarea]:py-[11px] [&_textarea]:px-[12px] [&_textarea]:[border:1px_solid_var(--line)] [&_textarea]:rounded-[4px] [&_textarea]:bg-card [&_textarea]:text-foreground [&_textarea]:[font:inherit] [&_input:focus]:border-primary [&_textarea:focus]:border-primary [&>button]:justify-self-start max-[640px]:[&>button]:justify-self-stretch max-[640px]:[&>button]:justify-center"
          }
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Label>
            Display name
            <Input
              required
              minLength={2}
              maxLength={60}
              value={displayName}
              disabled={busy}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Northstar Studio"
              autoComplete="organization"
            />
          </Label>
          <Label>
            Website <span className={"text-[10px]"}>optional · public</span>
            <Input
              type="url"
              maxLength={200}
              value={website}
              disabled={busy}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://yourstudio.com"
              autoComplete="url"
            />
          </Label>
          <Label>
            Contact email <span className={"text-[10px]"}>optional · private</span>
            <Input
              type="email"
              maxLength={120}
              value={contactEmail}
              disabled={busy}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="you@yourstudio.com"
              autoComplete="email"
            />
          </Label>
          <Label>
            Description <span className={"text-[10px]"}>optional</span>
            <textarea
              rows={3}
              maxLength={280}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What do you sell?"
            />
          </Label>
          <Button
            variant="brand"
            size="unstyled"
            className={"button button-green"}
            disabled={busy}
            type="submit"
          >
            {busy ? (
              <LoaderCircle
                size={16}
                className={
                  "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                }
              />
            ) : (
              <Check size={16} />
            )}
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
      )}
      {error && (
        <p
          role="alert"
          className={
            "payment-error py-[13px] px-[15px] [border:1px_solid_#e9cdc4] bg-[#fbf0eb] text-[#964b36] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          {error}
        </p>
      )}
    </Card>
  );
}
