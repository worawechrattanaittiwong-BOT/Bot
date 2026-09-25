"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ScenovaIcon } from "./ScenovaIcon";

type MobileTheme = "dark" | "light";

const MOBILE_THEME_STORAGE_KEY = "scenova-mobile-theme";
const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/account",
  "/packages",
  "/referrals",
  "/partner",
  "/cloud",
  "/admin",
  "/runtime-migration",
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const isAppRoute = useMemo(
    () => pathname === "/performance" ||
      APP_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/")),
    [pathname]
  );

  useEffect(() => {
    setTheme(preferredTheme());
    const updateNetwork = () => setOnline(window.navigator.onLine);
    updateNetwork();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scenovaMobileTheme = theme;
    root.dataset.scenovaMobileUi = "v1";
    document.body.classList.toggle("scn-mobile-app-route", isAppRoute);
    window.localStorage.setItem(MOBILE_THEME_STORAGE_KEY, theme);
    setMoreOpen(false);

    return () => {
      document.body.classList.remove("scn-mobile-app-route");
    };
  }, [theme, isAppRoute, pathname]);

  const primary = [
    { label:"Home", href:"/dashboard?view=overview", icon:"overview", active:pathname==="/dashboard" },
    { label:"Trade", href:"/dashboard?view=overview#bot-settings", icon:"control", active:false },
    { label:"Orders", href:"/dashboard?view=overview#live-orders", icon:"orders", active:false },
    { label:"Stats", href:"/performance", icon:"pnl", active:pathname==="/performance" }
  ];

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

      {!online ? (
        <div className="scn-mobile-network-state" role="status" aria-live="polite">
          <ScenovaIcon name="info" size={16}/>
          <span><b>Offline</b><small>รอการเชื่อมต่ออินเทอร์เน็ตกลับมา</small></span>
        </div>
      ) : null}

      {isAppRoute ? (
        <>
          <nav className="scn-mobile-primary-nav" aria-label="เมนูหลักมือถือ">
            {primary.map(item=>(
              <a key={item.label} href={item.href} className={item.active ? "active" : ""}>
                <ScenovaIcon name={item.icon} size={20}/>
                <span>{item.label}</span>
              </a>
            ))}
            <button type="button" className={moreOpen ? "active" : ""} aria-expanded={moreOpen} onClick={()=>setMoreOpen(value=>!value)}>
              <ScenovaIcon name="layers" size={20}/>
              <span>More</span>
            </button>
          </nav>

          {moreOpen ? (
            <div className="scn-mobile-more-backdrop" role="presentation" onClick={()=>setMoreOpen(false)}>
              <section className="scn-mobile-more-sheet" role="dialog" aria-modal="true" aria-label="เมนูเพิ่มเติม" onClick={event=>event.stopPropagation()}>
                <div className="scn-mobile-sheet-handle"/>
                <header><div><b>SCENOVA</b><span>เมนูและการตั้งค่าเพิ่มเติม</span></div><button type="button" aria-label="ปิดเมนู" onClick={()=>setMoreOpen(false)}>×</button></header>
                <div className="scn-mobile-more-grid">
                  <a href="/dashboard?view=account"><ScenovaIcon name="account" size={20}/><span><b>MT5 & EA</b><small>บัญชีและการเชื่อมต่อ</small></span></a>
                  <a href="/account"><ScenovaIcon name="shield" size={20}/><span><b>Account</b><small>โปรไฟล์และความปลอดภัย</small></span></a>
                  <a href="/packages"><ScenovaIcon name="wallet" size={20}/><span><b>Packages</b><small>Trial และสมาชิก</small></span></a>
                  <a href="/cloud"><ScenovaIcon name="cloud" size={20}/><span><b>Cloud MT5</b><small>แพ็กเกจและสถานะ Cloud</small></span></a>
                  <a href="/referrals"><ScenovaIcon name="users" size={20}/><span><b>Invite & Earn</b><small>Referral และ Wallet</small></span></a>
                  <a href="/partner"><ScenovaIcon name="users" size={20}/><span><b>Partner</b><small>จัดการ Customer Seats</small></span></a>
                  <a href="/runtime-migration"><ScenovaIcon name="refresh" size={20}/><span><b>Runtime</b><small>Local ↔ Cloud migration</small></span></a>
                  <a href="/dashboard?view=overview#mobile-system-center"><ScenovaIcon name="status" size={20}/><span><b>System</b><small>สถานะและเวอร์ชัน</small></span></a>
                </div>
                <div className="scn-mobile-more-theme">
                  <span><ScenovaIcon name="spark" size={18}/><b>Appearance</b></span>
                  <button type="button" onClick={()=>setTheme(current=>current==="dark"?"light":"dark")}>{theme==="dark"?"ใช้โหมดสว่าง":"ใช้โหมดมืด"}</button>
                </div>
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
