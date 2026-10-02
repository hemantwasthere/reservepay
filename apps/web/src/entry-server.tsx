import { CheckoutApp } from "./payments/CheckoutApp";
import { PaymentProvider } from "./payments/PaymentProvider";
import { MerchantApp } from "./merchant/MerchantApp";
import { ToastProvider } from "./lib/Toast";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { DemoProvider } from "./lib/demo-store";

export function render() {
  return renderToString(
    <StrictMode>
      <DemoProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </DemoProvider>
    </StrictMode>,
  );
}

export function renderMerchant(page: "overview" | "payments" = "overview") {
  return renderToString(
    <StrictMode>
      <ToastProvider>
        <PaymentProvider>
          <MerchantApp page={page} />
        </PaymentProvider>
      </ToastProvider>
    </StrictMode>,
  );
}

export function renderCheckout() {
  return renderToString(
    <StrictMode>
      <ToastProvider>
        <PaymentProvider>
          <CheckoutApp />
        </PaymentProvider>
      </ToastProvider>
    </StrictMode>,
  );
}
