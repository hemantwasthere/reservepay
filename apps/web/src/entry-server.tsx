import { CheckoutApp } from "./payments/CheckoutApp";
import { PaymentProvider } from "./payments/PaymentProvider";
import { MerchantApp } from "./merchant/MerchantApp";
import { ToastProvider } from "./lib/Toast";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { SiteApp } from "./lib/SiteApp";
import { ThemeProvider } from "./lib/Theme";

export function render() {
  return renderToString(
    <StrictMode>
      <SiteApp />
    </StrictMode>,
  );
}

export function renderMerchant(
  page: "overview" | "payments" | "profile" = "overview",
) {
  return renderToString(
    <StrictMode>
      <SiteApp initialPage={page} Merchant={MerchantApp} />
    </StrictMode>,
  );
}

export function renderCheckout() {
  return renderToString(
    <StrictMode>
      <ThemeProvider>
        <ToastProvider>
          <PaymentProvider>
            <CheckoutApp />
          </PaymentProvider>
        </ToastProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
