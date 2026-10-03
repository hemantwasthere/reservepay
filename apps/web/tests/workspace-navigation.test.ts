// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSiteNavigation } from "../src/merchant/workspace-navigation";
let root: Root, container: HTMLDivElement;
let mounts = 0;
function Probe() {
  const page = useSiteNavigation("overview");
  const [draft, setDraft] = useState("");
  useEffect(() => {
    mounts++;
  }, []);
  return createElement(
    "main",
    { id: "merchant-main", tabIndex: -1 },
    createElement("p", { id: "page" }, page),
    createElement("a", { id: "payments", href: "/app/payments" }, "Payments"),
    createElement("a", { id: "home", href: "/" }, "Home"),
    createElement("a", { id: "faq", href: "/#faq-title" }, "FAQ"),
    createElement("a", { id: "profile", href: "/app/profile" }, "Profile"),
    createElement(
      "a",
      { id: "external", href: "https://example.com/app" },
      "External",
    ),
    createElement("input", {
      value: draft,
      onInput: (e: React.InputEvent<HTMLInputElement>) =>
        setDraft(e.currentTarget.value),
    }),
  );
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/app");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mounts = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Probe)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
it("navigates and handles back/forward without remounting or losing form state", async () => {
  const input = container.querySelector("input")!;
  await act(async () => {
    input.value = "Unsaved profile";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container.querySelector<HTMLAnchorElement>("#payments")!.click(),
  );
  expect(location.pathname).toBe("/app/payments");
  expect(container.querySelector("#page")?.textContent).toBe("payments");
  await act(async () =>
    container.querySelector<HTMLAnchorElement>("#profile")!.click(),
  );
  expect(document.title).toBe("Merchant profile | ReservePay");
  await act(async () => {
    window.history.replaceState(null, "", "/app/payments");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(container.querySelector("#page")?.textContent).toBe("payments");
  expect(mounts).toBe(1);
  expect(input.value).toBe("Unsaved profile");
});
it("leaves modified clicks, external destinations and new tabs to the browser", async () => {
  async function intercepted(selector: string, options: MouseEventInit = {}) {
    let handled = false;
    const stopBrowser = (event: MouseEvent) => {
      handled = event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener("click", stopBrowser, { once: true });
    await act(async () =>
      container.querySelector(selector)!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ...options,
        }),
      ),
    );
    return handled;
  }
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])
    expect(await intercepted("#profile", options)).toBe(false);
  container.querySelector<HTMLAnchorElement>("#profile")!.target = "_blank";
  expect(await intercepted("#profile")).toBe(false);
  expect(await intercepted("#external")).toBe(false);
});

it("keeps the running workspace and draft through landing visits and history", async () => {
  const input = container.querySelector("input")!;
  await act(async () => {
    input.value = "Keep this draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container.querySelector<HTMLAnchorElement>("#home")!.click(),
  );
  expect(location.pathname).toBe("/");
  expect(container.querySelector("#page")?.textContent).toBe("landing");
  await act(async () =>
    container.querySelector<HTMLAnchorElement>("#profile")!.click(),
  );
  expect(container.querySelector("#page")?.textContent).toBe("profile");
  await act(async () =>
    container.querySelector<HTMLAnchorElement>("#faq")!.click(),
  );
  expect(location.hash).toBe("#faq-title");
  expect(container.querySelector("#page")?.textContent).toBe("landing");
  await act(async () => {
    window.history.replaceState(null, "", "/app/profile");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(container.querySelector("#page")?.textContent).toBe("profile");
  expect(input.value).toBe("Keep this draft");
  expect(mounts).toBe(1);
});
