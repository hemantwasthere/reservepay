export type CheckoutPhase =
  | { kind: "ready" } // can pay
  | { kind: "preparing" } // checking balance/reserve, building the transaction
  | { kind: "approving" } // wallet prompt open
  | { kind: "rejected" } // buyer declined in the wallet — nothing was sent
  | { kind: "sending" } // broadcasting
  | { kind: "confirming"; uncertain?: boolean } // pending journal, not yet confirmed
  | { kind: "verifying" } // confirmed on Solana, waiting for the finalized receipt
  | { kind: "failed" } // the transaction landed with an error — no payment
  | { kind: "expired" } // blockhash expired, never landed — no payment
  | { kind: "error"; message: string } // could not prepare (balance, coverage, wallet changed, link inactive…)
  | { kind: "unavailable" }; // verification RPC down; keep polling, don't retry

export type StepState = "todo" | "active" | "done" | "error";
export const STEPS = ["Review", "Approve", "Send", "Confirm", "Verified"] as const;

export function stepStates(phase: CheckoutPhase): StepState[] {
  switch (phase.kind) {
    case "ready":
    case "preparing":
      return ["active", "todo", "todo", "todo", "todo"];
    case "approving":
      return ["done", "active", "todo", "todo", "todo"];
    case "rejected":
      return ["done", "error", "todo", "todo", "todo"];
    case "sending":
      return ["done", "done", "active", "todo", "todo"];
    case "confirming":
    case "unavailable":
      return ["done", "done", "done", "active", "todo"];
    case "verifying":
      return ["done", "done", "done", "done", "active"];
    case "failed":
    case "expired":
      return ["done", "done", "done", "error", "todo"];
    case "error":
      return ["error", "todo", "todo", "todo", "todo"];
  }
}

export function canRetry(phase: CheckoutPhase): boolean {
  return ["ready", "rejected", "failed", "expired", "error"].includes(
    phase.kind,
  );
}

export function inFlight(phase: CheckoutPhase): boolean {
  return ["preparing", "approving", "sending"].includes(phase.kind);
}

// Single source for the text a phase shows: stepper sub-labels, the live
// region announcement and the inline notice all read from here.
export function phaseNote(phase: CheckoutPhase): string | null {
  switch (phase.kind) {
    case "preparing":
      return "Checking balance and reserve…";
    case "approving":
      return "Approve the payment in your wallet.";
    case "sending":
      return "Sending to Solana…";
    case "confirming":
      return phase.uncertain
        ? "Submission is uncertain. We’ll verify this transaction before allowing a retry."
        : "Waiting for Solana confirmation. You can safely reload this page.";
    case "verifying":
      return "Confirmed on Solana. Verifying the finalized order…";
    case "rejected":
      return "You declined the payment in your wallet. Nothing was sent and no funds moved.";
    case "failed":
      return "The transaction failed. No payment was made by this transaction.";
    case "expired":
      return "The transaction expired without confirmation. You can try again.";
    case "unavailable":
      return "Order verification is temporarily unavailable. We’ll keep checking; do not send another payment while one is pending.";
    default:
      return null;
  }
}
