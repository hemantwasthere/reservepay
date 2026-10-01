import { ToastProvider } from "../lib/Toast";
import "./polyfills";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { MerchantApp } from "./MerchantApp";

const app = (
  <StrictMode>
    <ToastProvider>
      <MerchantApp />
    </ToastProvider>
  </StrictMode>
);

const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
