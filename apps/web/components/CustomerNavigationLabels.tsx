"use client";

import { useEffect } from "react";

const customerNavigation = [
  { label: "Control Center", hint: "Bot status, controls & settings" },
  { label: "MT5 & EA", hint: "Accounts, devices & connections" },
  { label: "Access & Membership", hint: "Trial, subscription & access" },
  { label: "Backtest & Performance", hint: "Historical results, analytics & reports" }
] as const;

export function CustomerNavigationLabels() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applyLabels = () => {
      if (!window.location.pathname.includes("/dashboard")) return;

      const desktopButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          "aside.sidebar.app-sidebar:not(.owner-sidebar) nav.side-nav button.side-link-rich"
        )
      );

      desktopButtons.slice(0, customerNavigation.length).forEach((button, index) => {
        const copy = customerNavigation[index];
        const label = button.querySelector("span");
        const hint = button.querySelector("small");
        if (label && label.textContent !== copy.label) label.textContent = copy.label;
        if (hint && hint.textContent !== copy.hint) hint.textContent = copy.hint;
      });

      const mobileButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          ".mobile-nav:not(.owner-mobile-nav) button"
        )
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

    applyLabels();
    const observer = new MutationObserver(applyLabels);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
