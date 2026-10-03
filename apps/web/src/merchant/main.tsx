import "./polyfills";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { MerchantApp } from "./MerchantApp";
import { SiteApp } from "../lib/SiteApp";
const root = document.getElementById("root")!;
const page =
  root.dataset.page === "payments"
    ? "payments"
    : root.dataset.page === "profile"
      ? "profile"
      : root.dataset.page === "disputes"
        ? "disputes"
        : "overview";
const app = (
  <StrictMode>
    <SiteApp initialPage={page} Merchant={MerchantApp} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
