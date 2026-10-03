// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, useTheme } from "../src/lib/Theme";
let root: Root, container: HTMLDivElement;
let current: ReturnType<typeof useTheme>;
let media: EventTarget & { matches: boolean };
function Probe() {
  current = useTheme();
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  media = Object.assign(new EventTarget(), { matches: false });
  vi.spyOn(window, "matchMedia").mockReturnValue(
    media as unknown as MediaQueryList,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () =>
    root.render(
      createElement(ThemeProvider, { children: createElement(Probe) }),
    ),
  );
}
async function systemDark(dark: boolean) {
  await act(async () => {
    media.matches = dark;
    media.dispatchEvent(new Event("change"));
  });
}
it("follows live system changes until explicitly overridden", async () => {
  await mount();
  await systemDark(true);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await act(async () => current.setTheme("light"));
  expect(localStorage.getItem("reservepay.theme")).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  await systemDark(false);
  await systemDark(true);
  expect(current.resolvedTheme).toBe("light");
  await act(async () => current.setTheme("system"));
  expect(current.resolvedTheme).toBe("dark");
});
it("restores persisted appearance and synchronizes another tab's choice", async () => {
  localStorage.setItem("reservepay.theme", "dark");
  await mount();
  expect(current.theme).toBe("dark");
  expect(current.resolvedTheme).toBe("dark");
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "reservepay.theme",
        newValue: "light",
      }),
    ),
  );
  expect(current.resolvedTheme).toBe("light");
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, newValue: null }),
    ),
  );
  expect(current.theme).toBe("system");
});
it("still changes appearance when local storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  await mount();
  await act(async () => current.setTheme("dark"));
  expect(current.resolvedTheme).toBe("dark");
});
