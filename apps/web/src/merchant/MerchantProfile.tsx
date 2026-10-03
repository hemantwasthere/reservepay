import { MerchantAvatar } from "./MerchantAvatar";
import { prepareMerchantImage } from "./merchant-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Store, LoaderCircle, Check, Upload, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] leading-[1.7]"
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
      <ProfileForm
        key={session.token}
        token={session.token}
        onExpire={session.expire}
      />
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
  const saveImage = useAction(api.merchantImages.save);
  const profile = useQuery(api.merchants.me, { session: token });
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const mounted = useRef(true);
  const imageAttempt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const preview = useMemo(
    () => (image ? URL.createObjectURL(image) : null),
    [image],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      imageAttempt.current++;
    };
  }, []);
  const chooseImage = async (file?: File) => {
    if (!file) return;
    const attempt = ++imageAttempt.current;
    setPreparing(true);
    setError("");
    try {
      const prepared = await prepareMerchantImage(file);
      if (!mounted.current || imageAttempt.current !== attempt) return;
      dirty.current = true;
      setImage(prepared);
      setRemoveImage(false);
    } catch (cause) {
      if (mounted.current && imageAttempt.current === attempt)
        setError(
          cause instanceof Error ? cause.message : "Could not open this image.",
        );
    } finally {
      if (mounted.current && imageAttempt.current === attempt)
        setPreparing(false);
    }
  };

  useEffect(() => {
    if (dirty.current || profile === undefined) return;
    setDisplayName(profile?.displayName ?? "");
    setWebsite(profile?.website ?? "");
    setContactEmail(profile?.contactEmail ?? "");
    setDescription(profile?.description ?? "");
  }, [profile]);

  const submit = async () => {
    if (busy || preparing) return;
    setBusy(true);
    setError("");
    try {
      const clean = validateProfile({
        displayName,
        website,
        contactEmail,
        description,
      });
      if (image)
        await saveImage({
          session: token,
          profile: clean,
          image: await image.arrayBuffer(),
          contentType: image.type,
        });
      else await save({ session: token, profile: clean, removeImage });
      if (!mounted.current) return;
      dirty.current = false;
      setImage(null);
      setRemoveImage(false);
      notify({
        title: "Profile saved",
        description: "Your merchant details are now live on checkout.",
        tone: "success",
      });
    } catch (cause) {
      if (!mounted.current) return;
      const message =
        cause instanceof ConvexError && typeof cause.data === "string"
          ? cause.data
          : cause instanceof Error
            ? cause.message
            : "Could not save your profile.";
      if (message.includes("Sign in again")) onExpire();
      setError(message);
    } finally {
      if (mounted.current) setBusy(false);
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
          "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[light-dark(#91a481,var(--primary))]"
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
        Your name, image and website appear on every checkout. Your contact
        email stays private.
      </p>
      {profile === undefined ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] leading-[1.7]"
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
          aria-busy={busy || preparing}
          onChange={() => {
            dirty.current = true;
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-wrap items-center gap-4 rounded border border-border bg-background p-4">
            <MerchantAvatar
              url={preview ?? (removeImage ? null : profile?.imageUrl)}
              name={displayName}
              className="size-16 rounded-lg [&_[data-slot=avatar-fallback]]:rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium">
                Merchant image{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  optional · public
                </span>
              </p>
              <p
                id="merchant-image-help"
                className="text-[11px] leading-relaxed text-muted-foreground"
              >
                PNG, JPG or WebP, up to 2 MB. Shown on your checkout.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || preparing}
                  onClick={() => fileInput.current?.click()}
                >
                  {preparing ? (
                    <LoaderCircle className="size-3 animate-spin" />
                  ) : (
                    <Upload className="size-3" />
                  )}
                  {preparing
                    ? "Preparing image…"
                    : preview || (!removeImage && profile?.imageUrl)
                      ? "Change image"
                      : "Upload image"}
                </Button>
                {(preview || (!removeImage && profile?.imageUrl)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || preparing}
                    onClick={() => {
                      dirty.current = true;
                      setImage(null);
                      setRemoveImage(true);
                    }}
                  >
                    <X className="size-3" />
                    Remove image
                  </Button>
                )}
              </div>
              {(image || removeImage) && (
                <p className="mt-2 text-[11px] text-primary" role="status">
                  Save your profile to apply this change.
                </p>
              )}
            </div>
            <Input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Merchant image"
              aria-describedby="merchant-image-help"
              disabled={busy || preparing}
              onChange={(event) => {
                void chooseImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          <Label className="items-start">
            Display name
            <Input
              required
              minLength={2}
              maxLength={60}
              value={displayName}
              disabled={busy || preparing}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Northstar Studio"
              autoComplete="organization"
            />
          </Label>
          <Label className="items-start">
            <span>
              Website <span className="text-[10px]">optional · public</span>
            </span>
            <Input
              type="url"
              maxLength={200}
              value={website}
              disabled={busy || preparing}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://yourstudio.com"
              autoComplete="url"
            />
          </Label>
          <Label className="items-start">
            <span>
              Contact email{" "}
              <span className="text-[10px]">optional · private</span>
            </span>
            <Input
              type="email"
              maxLength={120}
              value={contactEmail}
              disabled={busy || preparing}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="you@yourstudio.com"
              autoComplete="email"
            />
          </Label>
          <Label className="items-start">
            <span>
              Description{" "}
              <span className="text-[10px]">optional · private</span>
            </span>
            <Textarea
              rows={3}
              maxLength={280}
              value={description}
              disabled={busy || preparing}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What do you sell?"
            />
          </Label>
          <Button
            variant="brand"
            size="unstyled"
            className={"button button-green"}
            disabled={busy || preparing}
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
            "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          {error}
        </p>
      )}
    </Card>
  );
}
