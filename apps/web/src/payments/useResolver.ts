import { useEffect, useState } from "react";
import { connection } from "../merchant/client";
import { paymentClient } from "./chain";

// Polls the on-chain protocol resolver. Used for UI gating only — never a
// security boundary. The program's has_one = resolver constraint is the real
// gate, and the dispute queue is public data.
export function useResolver(intervalMs = 30_000) {
  const [resolver, setResolver] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const value = await paymentClient(connection).readResolver();
        if (!stopped) {
          setResolver(value.toBase58());
          setError("");
          setChecked(true);
        }
      } catch {
        if (!stopped) {
          setResolver("");
          setError("Could not verify the protocol resolver. Retrying automatically…");
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  // "checking" is distinct from "not the resolver": the first read has not
  // finished and the last read did not fail.
  return { resolver, error, checking: !checked && !error };
}
