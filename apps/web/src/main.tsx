import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { DemoProvider } from "./lib/demo-store";
import "./styles.css";
import "./motion.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <DemoProvider>
      <App />
    </DemoProvider>
  </StrictMode>
);

if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
