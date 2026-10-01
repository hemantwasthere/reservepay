import { ToastProvider } from "./lib/Toast";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { DemoProvider } from "./lib/demo-store";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <DemoProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </DemoProvider>
  </StrictMode>
);

if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
