import { lazy, Suspense, useRef, useState, type ComponentType } from "react";
import { App } from "../App";
import { DemoProvider } from "./demo-store";
import { PaymentProvider } from "../payments/PaymentProvider";
import { ToastProvider } from "./Toast";
import { ThemeProvider } from "./Theme";
import {
  useSiteNavigation,
  type SitePage,
} from "../merchant/workspace-navigation";
import type { WorkspacePage } from "../merchant/WorkspaceSidebar";

const LazyMerchant = lazy(async () => {
  await import("../merchant/polyfills");
  const { MerchantApp } = await import("../merchant/MerchantApp");
  return { default: MerchantApp };
});

export function SiteApp({
  initialPage = "landing",
  Merchant = LazyMerchant,
}: {
  initialPage?: SitePage;
  Merchant?: ComponentType<{ page?: WorkspacePage }>;
}) {
  const page = useSiteNavigation(initialPage);
  const [visitedLanding, setVisitedLanding] = useState(
    initialPage === "landing",
  );
  if (page === "landing" && !visitedLanding) setVisitedLanding(true);
  const [visitedWorkspace, setVisitedWorkspace] = useState(
    initialPage !== "landing",
  );
  const lastWorkspace = useRef<WorkspacePage>(
    initialPage === "landing" ? "overview" : initialPage,
  );
  if (page !== "landing") {
    lastWorkspace.current = page;
    if (!visitedWorkspace) setVisitedWorkspace(true);
  }
  return (
    <ThemeProvider>
      <ToastProvider>
        {visitedLanding && (
          <div data-site-page="landing" hidden={page !== "landing"}>
            <DemoProvider>
              <App />
            </DemoProvider>
          </div>
        )}
        {visitedWorkspace && (
          <div data-site-page="workspace" hidden={page === "landing"}>
            <PaymentProvider>
              <Suspense
                fallback={
                  <main
                    className="grid min-h-screen place-items-center text-sm text-muted-foreground"
                    role="status"
                  >
                    Opening your workspace…
                  </main>
                }
              >
                <Merchant page={lastWorkspace.current} />
              </Suspense>
            </PaymentProvider>
          </div>
        )}
      </ToastProvider>
    </ThemeProvider>
  );
}
