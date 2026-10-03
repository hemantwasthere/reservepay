import { useEffect, useState } from "react";
import { site } from "../lib/seo";
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

export type SitePage = WorkspacePage | "landing";

// Keep the mounted workspace and its live subscriptions through landing visits.
// Real hrefs preserve direct entry, modified clicks, and browser history.
export function useSiteNavigation(initialPage: SitePage) {
  const [{ page, hash }, setRoute] = useState(() => ({
    page: initialPage,
    hash: typeof window === "undefined" ? "" : window.location.hash,
  }));
  useEffect(() => {
    const show = (url: URL) => {
      const next =
        url.pathname === "/" ? "landing" : workspacePage(url.pathname);
      if (next) setRoute({ page: next, hash: url.hash });
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
      const next =
        url.pathname === "/" ? "landing" : workspacePage(url.pathname);
      if (url.origin !== window.location.origin || !next) return;
      // Let native in-page anchors keep their usual scroll/focus behavior.
      if (url.pathname === window.location.pathname && url.hash) return;
      event.preventDefault();
      if (url.href !== window.location.href)
        window.history.pushState(null, "", url);
      show(url);
    };
    const pop = () => show(new URL(window.location.href));
    document.addEventListener("click", click);
    window.addEventListener("popstate", pop);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  useEffect(() => {
    document.title =
      page === "landing"
        ? site.title
        : `${page === "overview" ? "Merchant workspace" : page === "payments" ? "Payment links" : "Merchant profile"} | ReservePay`;
    const robots = document.querySelector('meta[name="robots"]');
    robots?.setAttribute(
      "content",
      page === "landing"
        ? "index, follow, max-image-preview:large"
        : "noindex, nofollow",
    );
    const frame = requestAnimationFrame(() => {
      let target: HTMLElement | null = null;
      try {
        target = hash
          ? document.getElementById(decodeURIComponent(hash.slice(1)))
          : null;
      } catch {}
      if (target) target.scrollIntoView();
      else window.scrollTo({ top: 0, behavior: "instant" });
      document
        .getElementById(page === "landing" ? "main" : "merchant-main")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [page, hash]);
  return page;
}
