import { useEffect, useId, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";

export function KeyboardShortcuts({
  dashboard = false,
}: {
  dashboard?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [enabled, setEnabled] = useState(true);
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
          "input, textarea, select, [contenteditable=true], [role=textbox]",
        )
      )
        return;
      if (event.code === "KeyK") {
        event.preventDefault();
        if (!dialog.current?.open) dialog.current?.showModal();
        return;
      }
      if (document.querySelector("dialog[open]")) return;
      const selector =
        event.code === "KeyW"
          ? ".wallet-button"
          : event.code === "KeyR"
            ? "[data-shortcut=refresh]"
            : event.code === "KeyA"
              ? "#reserve-amount"
              : undefined;
      const element = selector
        ? document.querySelector<HTMLButtonElement | HTMLInputElement>(selector)
        : null;
      if (!element || element.disabled) return;
      event.preventDefault();
      element.focus();
      if (event.code !== "KeyA") element.click();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [enabled]);
  return (
    <>
      <button
        className="shortcuts-trigger"
        aria-haspopup="dialog"
        aria-keyshortcuts="Alt+Shift+K"
        onClick={() => dialog.current?.showModal()}
      >
        <Keyboard size={14} aria-hidden="true" /> Shortcuts
      </button>
      <dialog
        ref={dialog}
        className="shortcuts-dialog"
        aria-labelledby={title}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls =
            event.currentTarget.querySelectorAll<HTMLElement>("button, input");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="shortcuts-heading">
          <h2 id={title}>A few helpful shortcuts</h2>
          <button
            aria-label="Close keyboard shortcuts"
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p>
          Use Alt (⌥ on Mac) + Shift with the keys below. Shortcuts pause while
          you type.
        </p>
        <dl>
          <div>
            <dt>Show shortcuts</dt>
            <dd>
              <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd>
            </dd>
          </div>
          {dashboard && (
            <>
              <div>
                <dt>Open wallet options</dt>
                <dd>
                  <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>W</kbd>
                </dd>
              </div>
              <div>
                <dt>Refresh balances</dt>
                <dd>
                  <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>
                </dd>
              </div>
              <div>
                <dt>Focus amount</dt>
                <dd>
                  <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd>
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Close a panel</dt>
            <dd>
              <kbd>Esc</kbd>
            </dd>
          </div>
        </dl>
        <label className="shortcuts-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              try {
                localStorage.setItem(
                  "reservepay.shortcuts",
                  event.target.checked ? "on" : "off",
                );
              } catch {}
            }}
          />{" "}
          Enable keyboard shortcuts
        </label>
        <p className="shortcuts-note">
          Transactions always require an explicit action and wallet approval.
        </p>
      </dialog>
    </>
  );
}
