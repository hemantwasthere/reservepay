import { Check, LoaderCircle, X } from "lucide-react";
import {
  STEPS,
  phaseNote,
  stepStates,
  type CheckoutPhase,
  type StepState,
} from "./checkout-phase";

const badge: Record<StepState, string> = {
  done: "bg-[light-dark(#edf1e7,var(--secondary))] text-[light-dark(#476238,var(--primary))]",
  active:
    "[border:1px_solid_light-dark(#c9d6b8,var(--primary))] text-[light-dark(#365b28,var(--primary))]",
  error:
    "bg-[light-dark(#faf0ed,var(--danger-soft))] text-[light-dark(#964b36,var(--danger))]",
  todo: "[border:1px_solid_var(--line)] text-muted-foreground",
};

export function PaymentSteps({ phase }: { phase: CheckoutPhase }) {
  const states = stepStates(phase);
  const note = phaseNote(phase);
  return (
    <div className="my-[18px]">
      <ol
        aria-label="Payment progress"
        className={
          "m-0 flex list-none items-start gap-[10px] p-0 max-[640px]:flex-col max-[640px]:gap-[12px]"
        }
      >
        {STEPS.map((label, index) => {
          const state = states[index];
          return (
            <li
              key={label}
              aria-current={state === "active" ? "step" : undefined}
              className={
                "flex min-w-0 flex-1 items-start gap-[8px] max-[640px]:flex-none"
              }
            >
              <span
                aria-hidden="true"
                className={`grid h-[20px] w-[20px] shrink-0 place-items-center rounded-[50%] [font:9px_var(--mono)] ${badge[state]}`}
              >
                {state === "done" ? (
                  <Check size={12} />
                ) : state === "active" ? (
                  <LoaderCircle
                    size={12}
                    className={
                      "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                    }
                  />
                ) : state === "error" ? (
                  <X size={12} />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0 pt-[2px]">
                <span
                  className={`block [font:10px_var(--mono)] tracking-[0.4px] ${
                    state === "todo"
                      ? "text-muted-foreground"
                      : state === "error"
                        ? "text-[light-dark(#964b36,var(--danger))]"
                        : "text-foreground"
                  }`}
                >
                  {label}
                </span>
                {state === "active" && note && (
                  <span className="mt-[3px] block text-[10px] leading-[1.5] text-muted-foreground">
                    {note}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
