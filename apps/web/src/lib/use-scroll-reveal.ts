import { useEffect, useRef } from "react";

export function useScrollReveal() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-reveal], [data-reveal-stagger] > *",
      ),
    );
    const animations = new Map<HTMLElement, Animation>();
    let observer: IntersectionObserver | undefined;

    const finish = (element: HTMLElement) => {
      element.classList.add("is-revealed");
      animations.get(element)?.cancel();
      animations.delete(element);
      observer?.unobserve(element);
    };

    const configure = () => {
      observer?.disconnect();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      if (preference.matches || !("IntersectionObserver" in window)) {
        targets.forEach(finish);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target as HTMLElement;
            element.classList.add("is-revealed");
            animations.get(element)?.play();
            observer?.unobserve(element);
          }
        },
        { threshold: 0.08, rootMargin: "0px 0px -18px 0px" },
      );
      for (const element of targets) {
        if (element.classList.contains("is-revealed")) continue;
        const bounds = element.getBoundingClientRect();
        if (bounds.top < window.innerHeight && bounds.bottom > 0) {
          finish(element);
          continue;
        }
        const siblings = element.parentElement?.hasAttribute(
          "data-reveal-stagger",
        )
          ? Array.from(element.parentElement.children)
          : [];
        const delay = Math.max(0, Math.min(siblings.indexOf(element), 4)) * 60;
        const animation = element.animate(
          [
            { opacity: 0, transform: "translateY(12px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: 520,
            delay,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        );
        animation.pause();
        animation.onfinish = () => finish(element);
        animations.set(element, animation);
        observer.observe(element);
      }
    };

    const revealFocused = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      for (const element of targets) {
        if (element.contains(event.target)) finish(element);
      }
    };

    configure();
    preference.addEventListener("change", configure);
    container.addEventListener("focusin", revealFocused);
    return () => {
      observer?.disconnect();
      animations.forEach((animation) => animation.cancel());
      preference.removeEventListener("change", configure);
      container.removeEventListener("focusin", revealFocused);
    };
  }, []);

  return root;
}
