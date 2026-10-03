import { ThemeProvider } from "../lib/Theme";
import "../merchant/polyfills";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { ToastProvider } from "../lib/Toast";
import { PaymentProvider } from "./PaymentProvider";
import { CheckoutApp } from "./CheckoutApp";
const app = (
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <PaymentProvider>
          <CheckoutApp />
        </PaymentProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>
);
const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
