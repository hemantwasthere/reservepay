import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { DemoProvider } from "./lib/demo-store";

export function render() {
  return renderToString(
    <StrictMode>
      <DemoProvider>
        <App />
      </DemoProvider>
    </StrictMode>,
  );
}
