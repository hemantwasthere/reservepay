import { useEffect, useState } from "react";
import type { WorkspacePage } from "./WorkspaceSidebar";

export function workspacePage(path: string): WorkspacePage | null {
  const normalized = path.replace(/\/$/, "");
  return normalized === "/app"
    ? "overview"
    : normalized === "/app/payments"
      ? "payments"
      : normalized === "/app/profile"
        ? "profile"
        : null;
}

// Keep the wallet, session and reactive subscriptions alive across workspace
// routes. Real hrefs still support reloads, direct entry and opening a new tab.
export function useWorkspaceNavigation(initialPage: WorkspacePage) {
  const [page, setPage] = useState(initialPage);
  useEffect(() => {
    const show = (next: WorkspacePage) => {
      setPage(next);
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("merchant-main")?.focus({ preventScroll: true });
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      const next = workspacePage(url.pathname);
      if (url.origin !== window.location.origin || !next || url.hash) return;
      event.preventDefault();
      if (url.href !== window.location.href)
        window.history.pushState(null, "", url);
      show(next);
    };
    const pop = () => {
      const next = workspacePage(window.location.pathname);
      if (next) show(next);
    };
    document.addEventListener("click", click);
    window.addEventListener("popstate", pop);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  useEffect(() => {
    document.title = `${page === "overview" ? "Merchant workspace" : page === "payments" ? "Payment links" : "Merchant profile"} | ReservePay`;
  }, [page]);
  return page;
}
