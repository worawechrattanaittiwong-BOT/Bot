"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type MobileTheme = "dark" | "light";

const MOBILE_THEME_STORAGE_KEY = "scenova-mobile-theme";
const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/account",
  "/performance",
  "/packages",
  "/referrals",
  "/partner",
  "/cloud",
  "/admin",
  "/trading-symbol"
];

function preferredTheme(): MobileTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(MOBILE_THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function MobileExperience() {
  const pathname = usePathname() || "/";
  const [theme, setTheme] = useState<MobileTheme>("dark");
  const isAppRoute = useMemo(
    () => APP_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/")),
    [pathname]
  );

  useEffect(() => {
    setTheme(preferredTheme());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scenovaMobileTheme = theme;
    root.dataset.scenovaMobileUi = "v1";
    document.body.classList.toggle("scn-mobile-app-route", isAppRoute);
    window.localStorage.setItem(MOBILE_THEME_STORAGE_KEY, theme);

    return () => {
      document.body.classList.remove("scn-mobile-app-route");
    };
  }, [theme, isAppRoute]);

  return (
    <div className="scn-mobile-experience" data-mobile-ui-only="true">
      <button
        type="button"
        className="scn-mobile-theme-toggle"
        aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
        title={theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
        onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}
      >
        <span className={"scn-mobile-theme-glyph " + theme} aria-hidden="true"><i/></span>
        <span>{theme === "dark" ? "สว่าง" : "มืด"}</span>
      </button>
    </div>
  );
}
