"use client";

import Link from "next/link";
import { useState } from "react";
import { ScenovaIcon } from "./ScenovaIcon";
import { ScenovaBrand } from "./ScenovaBrand";
import { InAppCampaignHost } from "./InAppCampaignHost";

type NavSection = "TRADING" | "MANAGEMENT" | "SYSTEM";
type NavItem = {
  section: NavSection;
  key: string;
  href: string;
  icon: string;
  label: string;
  hint: string;
};

const controlCenterNavItem: NavItem = {
  section:"TRADING", key:"trading-overview", href:"/dashboard?view=overview", icon:"control",
  label:"Control Center", hint:"Bot status, controls & live monitoring"
};
const mt5EaNavItem: NavItem = {
  section:"TRADING", key:"trading-account", href:"/dashboard?view=account", icon:"account",
  label:"MT5 & EA", hint:"Local / Cloud accounts & EA management"
};
const performanceNavItem: NavItem = {
  section:"TRADING", key:"trading-backtest", href:"/performance", icon:"strategy",
  label:"Backtest & Performance", hint:"Real performance, backtests & reports"
};
const myAccountNavItem: NavItem = {
  section:"MANAGEMENT", key:"my-account", href:"/account", icon:"account",
  label:"My Account", hint:"Profile, security & sign-in settings"
};
const packagesNavItem: NavItem = {
  section:"MANAGEMENT", key:"packages", href:"/packages", icon:"wallet",
  label:"Packages", hint:"Trial, Local MT5 & Cloud MT5"
};
const inviteEarnNavItem: NavItem = {
  section:"MANAGEMENT", key:"referrals", href:"/referrals", icon:"users",
  label:"Invite & Earn", hint:"Share your link & earn rewards"
};

export const sharedTradingNavItems: NavItem[] = [
  controlCenterNavItem,
  mt5EaNavItem,
  performanceNavItem
];

export const ownerNavItems: NavItem[] = [
  controlCenterNavItem,
  mt5EaNavItem,
  { section:"TRADING", key:"admin-workers", href:"/admin?view=workers", icon:"cloud", label:"Cloud Trading", hint:"Trading nodes & execution infrastructure" },
  performanceNavItem,
  myAccountNavItem,
  inviteEarnNavItem,
  { section:"MANAGEMENT", key:"admin-customers", href:"/admin?view=customers", icon:"users", label:"Customers & Memberships", hint:"Trials, subscriptions & customer access" },
  { section:"MANAGEMENT", key:"commission-withdrawals", href:"/admin/commission", icon:"wallet", label:"Commission & Withdrawals", hint:"Wallet rules, withdrawal queue & payout audit" },
  { section:"SYSTEM", key:"admin-overview", href:"/admin?view=overview", icon:"overview", label:"System Overview", hint:"Platform health & system status" },
  { section:"SYSTEM", key:"system-test", href:"/admin/system-test", icon:"overview", label:"System Test", hint:"Read-only health checks & test history" },
  { section:"SYSTEM", key:"service-links", href:"/admin/service-links", icon:"strategy", label:"API & Service Links", hint:"Private links for connected services & providers" },
  { section:"SYSTEM", key:"cloud-hardening", href:"/admin/cloud-hardening", icon:"cloud", label:"Production Hardening", hint:"Incidents, capacity guard & emergency controls" },
  { section:"SYSTEM", key:"website", href:"/website", icon:"strategy", label:"Website", hint:"SCENOVA public website" }
];

export const customerNavItems: NavItem[] = [...sharedTradingNavItems, packagesNavItem, myAccountNavItem, inviteEarnNavItem];

type SidebarNavigateHandler = (href:string)=>boolean | void;
type PartnerSummary = {
  usedSeats?: number;
  seat_limit?: number;
  status?: string;
} | null | undefined;

function sidebarItems(elevated:boolean, partner?:PartnerSummary): NavItem[] {
  const items = elevated ? [...ownerNavItems] : [...customerNavItems];
  if (!elevated && partner) {
    items.push({
      section:"MANAGEMENT",
      key:"partner-dashboard",
      href:"/partner",
      icon:"users",
      label:"Partner Dashboard",
      hint:`${partner.usedSeats || 0}/${partner.seat_limit || 0} Seats · ${partner.status || "ACTIVE"}`
    });
  }
  return items;
}

function UnifiedSidebar({
  activeKey,
  onLogout,
  onNavigate,
  elevated,
  role,
  userCode,
  partner
}:{
  activeKey:string;
  onLogout:()=>void;
  onNavigate?:SidebarNavigateHandler;
  elevated:boolean;
  role:string;
  userCode?:string|null;
  partner?:PartnerSummary;
}) {
  const items = sidebarItems(elevated, partner);
  const sections = (["TRADING","MANAGEMENT","SYSTEM"] as const)
    .filter(section=>items.some(item=>item.section===section));
  const profileTitle = elevated ? "System Role" : "User ID";
  const profileValue = elevated ? role.toUpperCase() : String(userCode || "CUSTOMER");
  const avatar = elevated ? (role.toUpperCase()==="ADMIN" ? "A" : "O") : "U";

  return (
    <>
    <aside className={"sidebar app-sidebar owner-sidebar " + (elevated ? "elevated-sidebar" : "customer-role-sidebar")}>
      <Link href="/dashboard?view=overview" className="brand-lockup side-brand scenova-brand-lockup" aria-label="SCENOVA Control Center">
        <ScenovaBrand className="scenova-brand-logo-sidebar"/>
      </Link>

      {sections.map(section=>(
        <div key={section}>
          <div className={"owner-nav-label " + (section!=="TRADING" ? "owner-nav-label-secondary" : "")}>{section}</div>
          <nav className="side-nav owner-nav">
            {items.filter(item=>item.section===section).map(item=>(
              <Link
                key={item.key}
                href={item.href}
                prefetch
                aria-current={activeKey===item.key ? "page" : undefined}
                className={"owner-nav-item owner-nav-link " + (activeKey===item.key ? "active" : "")}
                onClick={(event)=>{
                  if (onNavigate?.(item.href) === true) event.preventDefault();
                }}
              >
                <span className="owner-nav-icon"><ScenovaIcon name={item.icon} size={18}/></span>
                <span className="owner-nav-copy" title={item.hint}><b>{item.label}</b></span>
                <span className="owner-nav-caret" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>
        </div>
      ))}

      <div className="owner-profile">
        <div className="owner-avatar">{avatar}</div>
        <div><small>{profileTitle}</small><b>{profileValue}</b></div>
        <span className="dot green"/>
      </div>
      <button type="button" className="btn ghost full owner-logout" onClick={onLogout}><ScenovaIcon name="logout" size={18}/>Sign Out</button>
    </aside>
    <InAppCampaignHost />
    </>
  );
}

function UnifiedMobileNav({
  activeKey,
  onNavigate,
  elevated,
  partner
}:{
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
  elevated:boolean;
  partner?:PartnerSummary;
}) {
  const items = sidebarItems(elevated, partner);
  const sections = (["TRADING","MANAGEMENT","SYSTEM"] as const)
    .filter(section=>items.some(item=>item.section===section));
  const [open, setOpen] = useState(false);
  const drawerId = elevated ? "owner-mobile-sidebar-drawer" : "customer-mobile-sidebar-drawer";

  return (
    <>
      <div className="mobile-only owner-mobile-nav owner-mobile-nav-trigger-wrap">
        <button
          type="button"
          className={"owner-mobile-nav-trigger " + (open ? "active" : "")}
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={()=>setOpen(value=>!value)}
        >
          <ScenovaIcon name="overview" size={19}/>
          <span>เมนู</span>
        </button>
      </div>

      {open ? (
        <div
          className="mobile-only owner-mobile-drawer-backdrop"
          role="presentation"
          onClick={()=>setOpen(false)}
        >
          <aside
            id={drawerId}
            className="owner-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="เมนูระบบ"
            onClick={event=>event.stopPropagation()}
          >
            <div className="owner-mobile-drawer-handle" aria-hidden="true"/>
            <header className="owner-mobile-drawer-head">
              <div>
                <b>SCENOVA</b>
                <span>{elevated ? "Owner / Admin Menu" : "เมนูระบบ"}</span>
              </div>
              <button type="button" className="owner-mobile-drawer-close" aria-label="ปิดเมนู" onClick={()=>setOpen(false)}>×</button>
            </header>

            <div className="owner-mobile-drawer-body">
              {sections.map(section=>(
                <section key={section} className="owner-mobile-drawer-section">
                  <div className="owner-mobile-drawer-label">{section}</div>
                  <div className="owner-mobile-drawer-grid">
                    {items.filter(item=>item.section===section).map(item=>(
                      <Link
                        key={item.key}
                        href={item.href}
                        prefetch
                        aria-current={activeKey===item.key ? "page" : undefined}
                        className={"owner-mobile-drawer-item " + (activeKey===item.key ? "active" : "")}
                        onClick={(event)=>{
                          setOpen(false);
                          if (onNavigate?.(item.href) === true) event.preventDefault();
                        }}
                      >
                        <span className="owner-mobile-drawer-icon"><ScenovaIcon name={item.icon} size={20}/></span>
                        <span className="owner-mobile-drawer-copy">
                          <b>{item.label}</b>
                          <small>{item.hint}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function OwnerSidebar({
  activeKey,
  onLogout,
  onNavigate,
  role = "OWNER"
}:{
  activeKey:string;
  onLogout:()=>void;
  onNavigate?:SidebarNavigateHandler;
  role?:string;
}) {
  return (
    <UnifiedSidebar
      activeKey={activeKey}
      onLogout={onLogout}
      onNavigate={onNavigate}
      elevated
      role={role}
    />
  );
}

export function CustomerSidebar({
  activeKey,
  onLogout,
  onNavigate,
  userCode,
  partner
}:{
  activeKey:string;
  onLogout:()=>void;
  onNavigate?:SidebarNavigateHandler;
  userCode?:string|null;
  partner?:PartnerSummary;
}) {
  return (
    <UnifiedSidebar
      activeKey={activeKey}
      onLogout={onLogout}
      onNavigate={onNavigate}
      elevated={false}
      role="CUSTOMER"
      userCode={userCode}
      partner={partner}
    />
  );
}

export function OwnerMobileNav({
  activeKey,
  onNavigate
}:{
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
}) {
  return <UnifiedMobileNav activeKey={activeKey} onNavigate={onNavigate} elevated/>;
}

export function CustomerMobileNav({
  activeKey,
  onNavigate,
  partner
}:{
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
  partner?:PartnerSummary;
}) {
  return <UnifiedMobileNav activeKey={activeKey} onNavigate={onNavigate} elevated={false} partner={partner}/>;
}
