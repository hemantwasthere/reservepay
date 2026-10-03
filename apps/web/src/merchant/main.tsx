import { PaymentProvider } from "../payments/PaymentProvider";
import { ToastProvider } from "../lib/Toast";
import "./polyfills";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { MerchantApp } from "./MerchantApp";

const app = (
  <StrictMode>
    <ToastProvider>
      <PaymentProvider>
        <MerchantApp
          page={
            document.getElementById("root")?.dataset.page === "payments"
              ? "payments"
              : document.getElementById("root")?.dataset.page === "profile"
                ? "profile"
                : "overview"
          }
        />
      </PaymentProvider>
    </ToastProvider>
  </StrictMode>
);

const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
