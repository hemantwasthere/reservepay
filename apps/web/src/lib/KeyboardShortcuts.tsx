import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
export function KeyboardShortcuts({
  dashboard = false,
  payments = false,
}: {
  dashboard?: boolean;
  payments?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem("reservepay.shortcuts") !== "off");
    } catch {}
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !enabled ||
        event.repeat ||
        !event.altKey ||
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.defaultPrevented ||
        event.isComposing
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input,textarea,select,[contenteditable=true],[role=textbox]",
        )
      )
        return;
      if (event.code === "KeyK") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const selector =
        event.code === "KeyW"
          ? ".wallet-button"
          : event.code === "KeyR"
            ? payments
              ? "[data-shortcut=refresh-orders]"
              : "[data-shortcut=refresh]"
            : event.code === "KeyA"
              ? payments
                ? "#payment-link-amount"
                : "#reserve-amount"
              : undefined;
      const el = selector
        ? document.querySelector<HTMLButtonElement | HTMLInputElement>(selector)
        : null;
      if (!el || el.disabled) return;
      event.preventDefault();
      el.focus();
      if (event.code !== "KeyA") el.click();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [enabled, payments]);
  const shortcuts = [
    ...[{ label: "Show shortcuts", keys: ["Alt", "Shift", "K"] }],
    ...(dashboard
      ? [
          { label: "Open wallet options", keys: ["Alt", "Shift", "W"] },
          {
            label: payments ? "Refresh orders" : "Refresh balances",
            keys: ["Alt", "Shift", "R"],
          },
          { label: "Focus amount", keys: ["Alt", "Shift", "A"] },
          { label: "Toggle sidebar", keys: ["Alt", "Shift", "B"] },
        ]
      : []),
    { label: "Close a panel", keys: ["Esc"] },
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="shortcuts-trigger h-auto gap-2 p-0 text-[10px] text-muted-foreground"
          aria-keyshortcuts="Alt+Shift+K"
        >
          <Keyboard className="size-[14px]" />
          Shortcuts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto max-w-[calc(100%-2rem)] rounded bg-card p-7 sm:max-w-[450px]">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-lg font-medium tracking-[-.4px]">
            A few helpful shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Use Alt (⌥ on Mac) + Shift with the keys below. Shortcuts pause
            while you type.
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border">
          {shortcuts.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-4 py-3 text-xs"
            >
              <dt>{item.label}</dt>
              <dd className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                {item.keys.map((key, i) => (
                  <span key={key}>
                    {i > 0 && " + "}
                    <kbd className="rounded border border-border bg-background px-1.5 py-1">
                      {key}
                    </kbd>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Checkbox
            id="enable-shortcuts"
            checked={enabled}
            onCheckedChange={(value) => {
              const next = value === true;
              setEnabled(next);
              try {
                localStorage.setItem(
                  "reservepay.shortcuts",
                  next ? "on" : "off",
                );
              } catch {}
            }}
          />
          <Label htmlFor="enable-shortcuts" className="text-xs font-normal">
            Enable keyboard shortcuts
          </Label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Transactions always require an explicit action and wallet approval.
        </p>
      </DialogContent>
    </Dialog>
  );
}
