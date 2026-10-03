// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
vi.mock("../src/App", () => ({
  App: () =>
    h(
      "main",
      { id: "main", tabIndex: -1 },
      h("a", { href: "/app/profile", id: "open-app" }, "Open app"),
    ),
}));
vi.mock("../src/lib/demo-store", () => ({
  DemoProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../src/lib/Toast", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../src/payments/PaymentProvider", () => ({
  PaymentProvider: ({ children }: { children: React.ReactNode }) => children,
}));
import { SiteApp } from "../src/lib/SiteApp";
let mounts = 0,
  cleanups = 0;
function Merchant() {
  const [value, setValue] = useState("First live value");
  useEffect(() => {
    mounts++;
    const update = () => setValue("Updated in background");
    window.addEventListener("live-update", update);
    return () => {
      cleanups++;
      window.removeEventListener("live-update", update);
    };
  }, []);
  return h(
    "main",
    { id: "merchant-main", tabIndex: -1 },
    h("a", { href: "/", id: "home" }, "Home"),
    h("p", { id: "live-data" }, value),
    h("input", { defaultValue: "Unsaved draft" }),
  );
}
afterEach(() => vi.restoreAllMocks());
it("keeps workspace subscriptions active and drafts intact through a landing round trip", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/app/profile");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mounts = cleanups = 0;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(h(SiteApp, { initialPage: "profile", Merchant })),
    );
    const input = container.querySelector("input")!;
    await act(async () =>
      container.querySelector<HTMLAnchorElement>("#home")!.click(),
    );
    expect(
      container.querySelector<HTMLDivElement>('[data-site-page="workspace"]')
        ?.hidden,
    ).toBe(true);
    await act(async () => window.dispatchEvent(new Event("live-update")));
    await act(async () =>
      container.querySelector<HTMLAnchorElement>("#open-app")!.click(),
    );
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Unsaved draft");
    expect(container.querySelector("#live-data")?.textContent).toBe(
      "Updated in background",
    );
    expect(mounts).toBe(1);
    expect(cleanups).toBe(0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
