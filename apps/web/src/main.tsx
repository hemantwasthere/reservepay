import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { SiteApp } from "./lib/SiteApp";
const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <SiteApp />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
