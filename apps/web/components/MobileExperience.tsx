"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { ScenovaIcon } from "./ScenovaIcon";

type MobileTheme = "dark" | "light";

const MOBILE_THEME_STORAGE_KEY = "scenova-mobile-theme";
const MOBILE_SCROLL_TARGET_KEY = "scenova-mobile-scroll-target";
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

function firstRouteSegment(pathname:string) {
  return pathname.split("/").filter(Boolean)[0] || "root";
}

export function MobileExperience() {
  const pathname = usePathname() || "/";
  const [theme, setTheme] = useState<MobileTheme>("dark");
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [locationState, setLocationState] = useState({ search:"", hash:"" });
  const [elevated, setElevated] = useState(false);

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
    const syncLocation = () => setLocationState({
      search: window.location.search,
      hash: window.location.hash
    });
    syncLocation();
    window.addEventListener("popstate", syncLocation);
    window.addEventListener("hashchange", syncLocation);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.removeEventListener("hashchange", syncLocation);
    };
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.dataset.scenovaMobileTheme = theme;
    root.dataset.scenovaMobileUi = "v1";
    body.dataset.scnMobileRoute = firstRouteSegment(pathname);
    body.classList.toggle("scn-mobile-app-route", isAppRoute);
    window.localStorage.setItem(MOBILE_THEME_STORAGE_KEY, theme);
    setMoreOpen(false);

    const detectElevated = () => setElevated(Boolean(document.querySelector(".sidebar.elevated-sidebar")));
    detectElevated();
    const timer = window.setTimeout(detectElevated, 350);

    return () => {
      window.clearTimeout(timer);
      body.classList.remove("scn-mobile-app-route");
      delete body.dataset.scnMobileRoute;
    };
  }, [theme, isAppRoute, pathname]);

  useEffect(() => {
    if (!isAppRoute) return;
    const timers:number[] = [];
    const tryScroll = () => {
      const stored = window.sessionStorage.getItem(MOBILE_SCROLL_TARGET_KEY);
      const hashTarget = window.location.hash.replace(/^#/, "");
      const target = stored || hashTarget;
      if (!target) return;
      const element = document.getElementById(target);
      if (!element) return;
      element.scrollIntoView({ behavior:"smooth", block:"start" });
      window.sessionStorage.removeItem(MOBILE_SCROLL_TARGET_KEY);
    };
    [80, 260, 700, 1400, 2600].forEach(delay => timers.push(window.setTimeout(tryScroll, delay)));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [isAppRoute, pathname, locationState.search, locationState.hash]);

  const currentView = pathname === "/dashboard"
    ? (new URLSearchParams(locationState.search).get("view") || "overview")
    : "";

  const tradeActive = pathname === "/dashboard" && locationState.hash === "#bot-settings";
  const ordersActive = pathname === "/dashboard" && locationState.hash === "#live-orders";
  const homeActive = pathname === "/dashboard" && currentView === "overview" && !tradeActive && !ordersActive;
  const statsActive = pathname === "/performance";
  const moreActive = moreOpen || (isAppRoute && !homeActive && !tradeActive && !ordersActive && !statsActive);

  function navigate(event:MouseEvent<HTMLElement>, href:string) {
    event.preventDefault();
    setMoreOpen(false);

    const target = new URL(href, window.location.origin);
    const current = new URL(window.location.href);
    const targetId = target.hash.replace(/^#/, "");

    if (targetId) window.sessionStorage.setItem(MOBILE_SCROLL_TARGET_KEY, targetId);
    else window.sessionStorage.removeItem(MOBILE_SCROLL_TARGET_KEY);

    const targetHref = target.pathname + target.search + target.hash;
    const sameDocument = current.pathname === target.pathname && current.search === target.search;

    if (sameDocument && targetId) {
      window.history.pushState({}, "", targetHref);
      setLocationState({ search:target.search, hash:target.hash });
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior:"smooth", block:"start" });
        window.sessionStorage.removeItem(MOBILE_SCROLL_TARGET_KEY);
        return;
      }
    }

    if (sameDocument && !targetId) {
      window.history.pushState({}, "", targetHref);
      setLocationState({ search:target.search, hash:"" });
      window.scrollTo({ top:0, behavior:"smooth" });
      return;
    }

    window.location.assign(targetHref);
  }

  const primary = [
    { label:"Home", href:"/dashboard?view=overview", icon:"overview", active:homeActive },
    { label:"Trade", href:"/dashboard?view=overview#bot-settings", icon:"control", active:tradeActive },
    { label:"Orders", href:"/dashboard?view=overview#live-orders", icon:"orders", active:ordersActive },
    { label:"Stats", href:"/performance", icon:"pnl", active:statsActive }
  ];

  return (
    <div className="scn-mobile-experience" data-mobile-ui-only="true">
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
              <a
                key={item.label}
                href={item.href}
                className={item.active ? "active" : ""}
                aria-current={item.active ? "page" : undefined}
                onClick={event=>navigate(event,item.href)}
              >
                <ScenovaIcon name={item.icon} size={20}/>
                <span>{item.label}</span>
              </a>
            ))}
            <button type="button" className={moreActive ? "active" : ""} aria-expanded={moreOpen} onClick={()=>setMoreOpen(value=>!value)}>
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
                  <a href="/dashboard?view=account" onClick={event=>navigate(event,"/dashboard?view=account")}><ScenovaIcon name="account" size={20}/><span><b>MT5 & EA</b><small>บัญชีและการเชื่อมต่อ</small></span></a>
                  <a href="/account" onClick={event=>navigate(event,"/account")}><ScenovaIcon name="shield" size={20}/><span><b>Account</b><small>โปรไฟล์และความปลอดภัย</small></span></a>
                  <a href="/packages" onClick={event=>navigate(event,"/packages")}><ScenovaIcon name="wallet" size={20}/><span><b>Packages</b><small>Trial และสมาชิก</small></span></a>
                  <a href="/cloud" onClick={event=>navigate(event,"/cloud")}><ScenovaIcon name="cloud" size={20}/><span><b>Cloud MT5</b><small>แพ็กเกจและสถานะ Cloud</small></span></a>
                  <a href="/referrals" onClick={event=>navigate(event,"/referrals")}><ScenovaIcon name="users" size={20}/><span><b>Invite & Earn</b><small>Referral และ Wallet</small></span></a>
                  <a href="/partner" onClick={event=>navigate(event,"/partner")}><ScenovaIcon name="users" size={20}/><span><b>Partner</b><small>จัดการ Customer Seats</small></span></a>
                  <a href="/runtime-migration" onClick={event=>navigate(event,"/runtime-migration")}><ScenovaIcon name="refresh" size={20}/><span><b>Runtime</b><small>Local ↔ Cloud migration</small></span></a>
                  <a href="/dashboard?view=overview#mobile-system-center" onClick={event=>navigate(event,"/dashboard?view=overview#mobile-system-center")}><ScenovaIcon name="status" size={20}/><span><b>System</b><small>สถานะและเวอร์ชัน</small></span></a>
                </div>

                {elevated ? (
                  <div className="scn-mobile-owner-tools">
                    <span className="scn-mobile-more-section-title">OWNER / ADMIN</span>
                    <div className="scn-mobile-more-grid">
                      <a href="/admin?view=workers" onClick={event=>navigate(event,"/admin?view=workers")}><ScenovaIcon name="cloud" size={20}/><span><b>Cloud Trading</b><small>Workers และ execution</small></span></a>
                      <a href="/admin?view=customers" onClick={event=>navigate(event,"/admin?view=customers")}><ScenovaIcon name="users" size={20}/><span><b>Customers</b><small>สมาชิกและสิทธิ์</small></span></a>
                      <a href="/admin/commission" onClick={event=>navigate(event,"/admin/commission")}><ScenovaIcon name="wallet" size={20}/><span><b>Commission</b><small>ถอนเงินและ audit</small></span></a>
                      <a href="/admin?view=overview" onClick={event=>navigate(event,"/admin?view=overview")}><ScenovaIcon name="overview" size={20}/><span><b>System Overview</b><small>Platform health</small></span></a>
                      <a href="/admin/system-test" onClick={event=>navigate(event,"/admin/system-test")}><ScenovaIcon name="status" size={20}/><span><b>System Test</b><small>Health checks</small></span></a>
                      <a href="/admin/service-links" onClick={event=>navigate(event,"/admin/service-links")}><ScenovaIcon name="strategy" size={20}/><span><b>Service Links</b><small>API และ services</small></span></a>
                      <a href="/admin/cloud-hardening" onClick={event=>navigate(event,"/admin/cloud-hardening")}><ScenovaIcon name="shield" size={20}/><span><b>Hardening</b><small>Production controls</small></span></a>
                      <a href="/website" onClick={event=>navigate(event,"/website")}><ScenovaIcon name="strategy" size={20}/><span><b>Website</b><small>Public website</small></span></a>
                    </div>
                  </div>
                ) : null}

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
