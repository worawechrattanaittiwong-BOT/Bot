"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useCustomerLanguage } from "../../lib/i18n/provider";
import { LanguageSwitcher } from "./LanguageSwitcher";

// Customer screens with a shared sidebar use its compact language control.
// All other public/customer routes share the same non-overlay utility strip.
const sidebarRoutes = new Set([
  "/account", "/bot-inspection", "/broker", "/dashboard", "/fleet-monitor",
  "/follow-master", "/packages", "/performance", "/referrals",
]);
export function CustomerLanguageDock() {
  const pathname = usePathname();
  const { lang } = useCustomerLanguage();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  useEffect(() => {
    document.documentElement.lang = admin ? "th" : lang;
  }, [admin, lang]);
  const mobileOnly = pathname === "/performance";
  if (admin || (sidebarRoutes.has(pathname) && !mobileOnly)) return null;
  return (
    <div
      className={"scenova-language-utility-strip" + (mobileOnly ? " scenova-language-utility-strip--mobile-only" : "")}
      data-scenova-language-dock
    >
      <LanguageSwitcher compact />
    </div>
  );
}
