"use client";

import { useEffect } from "react";

const customerNavigation = [
  { label: "Control Center", hint: "Bot status, controls & settings" },
  { label: "MT5 & EA", hint: "Accounts, devices & connections" },
  { label: "Access & Membership", hint: "Trial, subscription & access" },
  { label: "Backtest & Performance", hint: "Real performance, backtests & reports" }
] as const;

export function CustomerNavigationLabels() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const desktopSelector = "aside.sidebar.app-sidebar:not(.owner-sidebar) nav.side-nav button.side-link-rich";
    const mobileSelector = ".mobile-nav:not(.owner-mobile-nav) button";

    const applyLabels = () => {
      if (!window.location.pathname.includes("/dashboard")) return;

      const desktopButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(desktopSelector)
      );

      desktopButtons.slice(0, customerNavigation.length).forEach((button, index) => {
        const copy = customerNavigation[index];
        const label = button.querySelector("span");
        const hint = button.querySelector("small");
        if (label && label.textContent !== copy.label) label.textContent = copy.label;
        if (hint && hint.textContent !== copy.hint) hint.textContent = copy.hint;
      });

      const mobileButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(mobileSelector)
      );
      mobileButtons.slice(0, customerNavigation.length).forEach((button, index) => {
        const next = customerNavigation[index].label;
        if (button.textContent !== next) button.textContent = next;
      });

      const signOut = document.querySelector<HTMLButtonElement>(
        "aside.sidebar.app-sidebar:not(.owner-sidebar) .sidebar-user button.btn.ghost.full"
      );
      if (signOut && signOut.textContent?.trim() !== "Sign Out") signOut.textContent = "Sign Out";
    };

    const routePerformance = (event: MouseEvent) => {
      if (!window.location.pathname.includes("/dashboard")) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const desktopButton = target.closest<HTMLButtonElement>(desktopSelector);
      const mobileButton = target.closest<HTMLButtonElement>(mobileSelector);
      const candidate = desktopButton || mobileButton;
      if (!candidate) return;
      const collection = desktopButton
        ? Array.from(document.querySelectorAll<HTMLButtonElement>(desktopSelector))
        : Array.from(document.querySelectorAll<HTMLButtonElement>(mobileSelector));
      if (collection.indexOf(candidate) !== 3) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.assign("/performance");
    };

    applyLabels();
    document.addEventListener("click", routePerformance, true);
    const observer = new MutationObserver(applyLabels);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("click", routePerformance, true);
    };
  }, []);

  return null;
}
