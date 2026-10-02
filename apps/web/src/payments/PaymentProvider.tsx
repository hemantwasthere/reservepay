import {
  Component,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
const Ready = createContext(false);
const deploymentUrl = import.meta.env.VITE_CONVEX_URL;
export const paymentsConfigured = Boolean(deploymentUrl);
// HTTP actions are served from the .convex.site domain.
export const convexSiteUrl =
  deploymentUrl?.replace(".convex.cloud", ".convex.site") ?? null;
// The transport connects lazily. Keep this provider mounted through hydration
// so enabling payment queries does not remount the wallet or dashboard.
const client = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;
export function PaymentProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return client ? (
    <ConvexProvider client={client}>
      <Ready.Provider value={ready}>{children}</Ready.Provider>
    </ConvexProvider>
  ) : (
    children
  );
}
export const usePaymentsReady = () => useContext(Ready);
export class PaymentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div
        className={
          "payment-error py-[13px] px-[15px] [border:1px_solid_#e9cdc4] bg-[#fbf0eb] text-[#964b36] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
        }
        role="alert"
      >
        Payment data could not load. Please reload the page to reconnect. Check
        your wallet activity before retrying a payment.
      </div>
    ) : (
      this.props.children
    );
  }
}
