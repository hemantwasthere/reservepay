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

export function renderMerchant() {
  return renderToString(
    <StrictMode>
      <ToastProvider>
        <MerchantApp />
      </ToastProvider>
    </StrictMode>,
  );
}
