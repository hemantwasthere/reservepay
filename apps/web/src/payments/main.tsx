import "../merchant/polyfills";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { ToastProvider } from "../lib/Toast";
import { PaymentProvider } from "./PaymentProvider";
import { CheckoutApp } from "./CheckoutApp";
const app = (
  <StrictMode>
    <ToastProvider>
      <PaymentProvider>
        <CheckoutApp />
      </PaymentProvider>
    </ToastProvider>
  </StrictMode>
);
const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
