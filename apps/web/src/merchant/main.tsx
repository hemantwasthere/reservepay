import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MerchantApp } from "./MerchantApp";
import "../styles.css";
import "../motion.css";
import "./merchant.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MerchantApp />
  </StrictMode>,
);
