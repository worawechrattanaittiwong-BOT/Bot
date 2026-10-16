"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ScenovaIcon } from "./ScenovaIcon";
import {useCustomerLanguage} from "../lib/i18n/provider";
import {LanguageSwitcher} from "./i18n/LanguageSwitcher";
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
const followMasterNavItem: NavItem = {
  section:"TRADING", key:"follow-master", href:"/follow-master", icon:"copy",
  label:"Follow Master", hint:"ติดตามโหมดและคำสั่ง START / SAFE STOP (เตรียมระบบ)"
};
const fleetMonitorNavItem: NavItem = {
  section:"TRADING", key:"trading-fleet-monitor", href:"/fleet-monitor", icon:"overview",
  label:"Trading Fleet Monitor", hint:"All MT5 slots, live performance & risk monitoring"
};

const botInspectionNavItem: NavItem = {
  section:"TRADING", key:"bot-inspection", href:"/bot-inspection", icon:"overview",
  label:"Bot Logs", hint:"ตรวจบัญชีและรอบเทรดย้อนหลัง · เวลาไทย"
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
const brokerNavItem: NavItem = {
  section:"MANAGEMENT", key:"broker-center", href:"/broker", icon:"cloud",
  label:"Broker", hint:"Broker connections & partner onboarding"
};
const inviteEarnNavItem: NavItem = {
  section:"MANAGEMENT", key:"referrals", href:"/referrals", icon:"referral",
  label:"Invite & Earn", hint:"Share your link & earn rewards"
};

export const sharedTradingNavItems: NavItem[] = [
  controlCenterNavItem,
  mt5EaNavItem,
  followMasterNavItem,
  fleetMonitorNavItem,
  performanceNavItem,
  botInspectionNavItem
];

export const ownerNavItems: NavItem[] = [
  controlCenterNavItem,
  mt5EaNavItem,
  followMasterNavItem,
  fleetMonitorNavItem,
  performanceNavItem,
  botInspectionNavItem,
  brokerNavItem,
  myAccountNavItem,
  inviteEarnNavItem,
  { section:"MANAGEMENT", key:"admin-customers", href:"/admin?view=customers", icon:"users", label:"Customers & Memberships", hint:"Trials, subscriptions & customer access" },
  { section:"MANAGEMENT", key:"commission-withdrawals", href:"/admin/commission", icon:"wallet", label:"Commission & Withdrawals", hint:"Wallet rules, withdrawal queue & payout audit" },
  { section:"MANAGEMENT", key:"promotion-center", href:"/admin/promotions", icon:"spark", label:"Promotion Center", hint:"Manage in-app campaigns, schedules & visibility" },
  { section:"SYSTEM", key:"admin-workers", href:"/admin?view=workers", icon:"cloud", label:"Cloud Trading", hint:"Trading nodes & execution infrastructure" },
  { section:"SYSTEM", key:"admin-overview", href:"/admin?view=overview", icon:"overview", label:"System Overview", hint:"Platform health & system status" },
  { section:"SYSTEM", key:"trading-modes", href:"/admin/trading-modes", icon:"strategy", label:"Trading Mode Control", hint:"ปิดโหมดรายตัวแบบ Safe Stop" },
  { section:"SYSTEM", key:"service-links", href:"/admin/service-links", icon:"strategy", label:"API & Service Links", hint:"Private links for connected services & providers" },
  { section:"SYSTEM", key:"cloud-hardening", href:"/admin/cloud-hardening", icon:"cloud", label:"Cloud Protection", hint:"สถานะ Cloud และการควบคุมฉุกเฉิน" },
  { section:"SYSTEM", key:"website", href:"/website", icon:"strategy", label:"Website", hint:"SCENOVA public website" }
];

export const customerNavItems: NavItem[] = [...sharedTradingNavItems, brokerNavItem, packagesNavItem, myAccountNavItem, inviteEarnNavItem];

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


/* Customer navigation presentation only: preserve original destinations and role checks. */
const customerMenuGroups = [
  { key:"mt5", icon:"account", label:"MT5 & Accounts", keys:["trading-account","broker-center","trading-fleet-monitor"] },
  { key:"strategies", icon:"strategy", label:"Trading Strategies", keys:["follow-master"] },
  { key:"reports", icon:"overview", label:"Performance & Reports", keys:["trading-backtest","bot-inspection"] },
  { key:"rewards", icon:"wallet", label:"Rewards & Wallet", keys:["referrals"] },
  { key:"account", icon:"account", label:"My Account", keys:["my-account","packages","partner-dashboard"] }
] as const;

/* Owner role: all 17 existing secondary links remain available, with the same hrefs.
 * Admin routes retain the existing ungrouped navigation. */
const ownerMenuGroups = [
  { key:"mt5", icon:"account", label:"MT5 & Accounts", keys:["trading-account","broker-center","trading-fleet-monitor","admin-workers"] },
  { key:"strategies", icon:"strategy", label:"Trading Strategies", keys:["follow-master","trading-modes"] },
  { key:"reports", icon:"overview", label:"Performance & Reports", keys:["trading-backtest","bot-inspection"] },
  { key:"rewards", icon:"wallet", label:"Rewards & Wallet", keys:["referrals","commission-withdrawals","promotion-center"] },
  { key:"account", icon:"account", label:"Account & Members", keys:["my-account","admin-customers"] },
  { key:"advanced", icon:"strategy", label:"Advanced Settings", keys:["admin-overview","service-links","cloud-hardening","website"] }
] as const;

function CustomerNavGroups({
  items,activeKey,onNavigate,mobile=false,onChoose,showLanguageControl=false,owner=false
}:{
  items:NavItem[];
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
  mobile?:boolean;
  onChoose?:()=>void;
  showLanguageControl?:boolean;
  owner?:boolean;
}) {
  const {t,lang}=useCustomerLanguage();
  const groups = owner ? ownerMenuGroups : customerMenuGroups;
  const currentGroup=groups.find(group=>group.keys.some(key=>key===activeKey))?.key||"";
  const [expanded,setExpanded]=useState<string>(currentGroup);
  useEffect(()=>{if(currentGroup)setExpanded(currentGroup)},[currentGroup]);
  const title=(key:string,fallback:string)=>owner ? fallback : t(key,fallback);
  const navigate=(event:React.MouseEvent<HTMLAnchorElement>,href:string)=>{
    onChoose?.();
    if(onNavigate?.(href)===true)event.preventDefault();
  };
  const control=items.find(item=>item.key==="trading-overview");
  return (
    <div className={"customer-nav-groups"+(mobile?" customer-nav-groups-mobile":"")+(owner?" owner-nav-groups":"")}>
      {!mobile&&(
        <div className="owner-nav-section-head customer-nav-heading">
          <div className="owner-nav-label">{owner||lang==="en"?"NAVIGATION":t("menu","เมนู")}</div>
          {showLanguageControl&&<LanguageSwitcher compact/>}
        </div>
      )}
      {control&&(
        <nav className="customer-nav-root" aria-label="Control Center">
          <Link
            href={control.href}
            prefetch
            aria-current={activeKey===control.key?"page":undefined}
            className={"customer-nav-primary"+(activeKey===control.key?" active":"")}
            onClick={event=>navigate(event,control.href)}
          >
            <span className="customer-nav-primary-icon"><ScenovaIcon name={control.icon} size={18}/></span>
            <span className="customer-nav-primary-text">{title(control.key,control.label)}</span>
            <span aria-hidden="true" className="customer-nav-arrow">›</span>
          </Link>
        </nav>
      )}
      {groups.map(group=>{
        const entries=items.filter(item=>(group.keys as readonly string[]).includes(item.key));
        if(!entries.length)return null;
        const opened=expanded===group.key;
        const selected=entries.some(item=>item.key===activeKey);
        return (
          <section className={"customer-nav-group"+(selected?" has-active":"")+(opened?" expanded":"")} key={group.key}>
            <button
              type="button"
              className="customer-nav-group-button"
              aria-expanded={opened}
              aria-controls={(mobile?"customer-mobile-menu-":"customer-desktop-menu-")+group.key}
              onClick={()=>setExpanded(open=>open===group.key?"":group.key)}
            >
              <span className="customer-nav-primary-icon"><ScenovaIcon name={group.icon} size={18}/></span>
              <span className="customer-nav-primary-text">{group.label}</span>
              <span aria-hidden="true" className="customer-nav-chevron">›</span>
            </button>
            <nav
              id={(mobile?"customer-mobile-menu-":"customer-desktop-menu-")+group.key}
              className="customer-nav-children"
              aria-label={group.label}
              hidden={!opened}
            >
              {entries.map(item=>(
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch
                  title={item.hint}
                  aria-current={activeKey===item.key?"page":undefined}
                  className={"customer-nav-child"+(activeKey===item.key?" active":"")}
                  onClick={event=>navigate(event,item.href)}
                >
                  <span className="customer-nav-child-dot" aria-hidden="true"/>
                  <span>{title(item.key,item.label)}</span>
                </Link>
              ))}
            </nav>
          </section>
        );
      })}
    </div>
  );
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
  const {t}=useCustomerLanguage();
  const pathname = usePathname();
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const showLanguageControl = !adminRoute;
  // OWNER navigation is consistent across /dashboard and every /admin subpage.
  // The current route determines the active link, not the sidebar layout.
  const groupedSidebar = !elevated || role.toUpperCase() === "OWNER";
  const navText=(key:string,label:string)=>elevated?label:t(key,label);
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

      {!groupedSidebar ? sections.map(section=>(
        <div key={section}>
          {section === "TRADING" ? (
            <div className="owner-nav-section-head">
              <div className="owner-nav-label">{navText(section,section)}</div>
              {showLanguageControl && <LanguageSwitcher compact />}
            </div>
          ) : (
            <div className="owner-nav-label owner-nav-label-secondary">{navText(section,section)}</div>
          )}
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
                <span className="owner-nav-copy" title={item.hint}><b>{navText(item.key,item.label)}</b></span>
                <span className="owner-nav-caret" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>
        </div>
      )) : (
        <CustomerNavGroups items={items} activeKey={activeKey} onNavigate={onNavigate} showLanguageControl={showLanguageControl} owner={elevated}/>
      )}

      <div className="owner-profile">
        <div className="owner-avatar">{avatar}</div>
        <div><small>{elevated?profileTitle:t("userId")}</small><b>{profileValue}</b></div>
        <span className="dot green"/>
      </div>
      <button type="button" className="btn ghost full owner-logout" onClick={onLogout}><ScenovaIcon name="logout" size={18}/>{navText("logout","Sign Out")}</button>
    </aside>
    <InAppCampaignHost />
    </>
  );
}

function UnifiedMobileNav({
  activeKey,
  onNavigate,
  onLogout,
  elevated,
  role,
  partner
}:{
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
  onLogout?:()=>void;
  elevated:boolean;
  role?:string;
  partner?:PartnerSummary;
}) {
  const {t}=useCustomerLanguage();
  const pathname = usePathname();
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  // Mirror the desktop role-based layout on every page (including /admin).
  const groupedSidebar = !elevated || String(role || "OWNER").toUpperCase() === "OWNER";
  const navText=(key:string,label:string)=>elevated?label:t(key,label);
  const items = sidebarItems(elevated, partner);
  const sections = (["TRADING","MANAGEMENT","SYSTEM"] as const)
    .filter(section=>items.some(item=>item.section===section));
  const [open, setOpen] = useState(false);
  const drawerId = elevated ? "owner-mobile-sidebar-drawer" : "customer-mobile-sidebar-drawer";

  useEffect(()=>{
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event:KeyboardEvent)=>{
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return ()=>{
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  },[open]);

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/dashboard?view=overview");
  }

  function reloadSystem() {
    window.location.reload();
  }

  function logoutSystem() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  return (
    <>
      <div className="mobile-only owner-mobile-nav owner-mobile-nav-trigger-wrap" aria-label="เครื่องมือบนมือถือ">
        <button
          type="button"
          className="owner-mobile-utility-button owner-mobile-back-button"
          aria-label="ย้อนกลับหน้าก่อนหน้า"
          onClick={goBack}
        >
          <span className="owner-mobile-utility-icon" aria-hidden="true">
            <svg className="owner-mobile-utility-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 6 7 12l6 6"/>
              <path d="M7 12h10"/>
            </svg>
          </span>
        </button>

        <Link href="/dashboard?view=overview" className="owner-mobile-topbar-brand" aria-label="SCENOVA">
          <ScenovaBrand className="owner-mobile-topbar-logo"/>
        </Link>

        <div className="owner-mobile-nav-right-actions">
          <button
            type="button"
            className="owner-mobile-utility-button owner-mobile-reload-button"
            aria-label="รีโหลดระบบใหม่"
            onClick={reloadSystem}
          >
            <span className="owner-mobile-utility-icon" aria-hidden="true">
              <svg className="owner-mobile-utility-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8"/>
                <path d="M20 4v4h-4"/>
              </svg>
            </span>
          </button>

          <button
            type="button"
            className={"owner-mobile-nav-trigger " + (open ? "active" : "")}
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={open ? "ปิดเมนูระบบ" : "เปิดเมนูระบบ"}
            onClick={()=>setOpen(value=>!value)}
          >
            <ScenovaIcon name="overview" size={19}/>
            <span>{navText("menu","เมนู")}</span>
          </button>
        </div>
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
            <header className="owner-mobile-drawer-head">
              <div>
                <b>SCENOVA</b>
                <span>{elevated ? "Owner / Admin Menu" : "เมนูระบบ"}</span>
              </div>
              <button type="button" className="owner-mobile-drawer-close" aria-label="ปิดเมนู" onClick={()=>setOpen(false)}>×</button>
            </header>

            {!pathname.startsWith("/admin") && <div className="owner-mobile-language-slot"><LanguageSwitcher compact /></div>}
            <div className="owner-mobile-drawer-body">
              {!groupedSidebar ? sections.map(section=>(
                <section key={section} className="owner-mobile-drawer-section">
                  <div className="owner-mobile-drawer-label">{navText(section,section)}</div>
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
                          <b>{navText(item.key,item.label)}</b>
                        </span>
                        <span className="owner-mobile-drawer-caret" aria-hidden="true">›</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )) : (
                <CustomerNavGroups items={items} activeKey={activeKey} onNavigate={onNavigate} owner={elevated} mobile onChoose={()=>setOpen(false)}/>
              )}
            </div>

            <button
              type="button"
              className="owner-mobile-drawer-logout"
              onClick={()=>{
                setOpen(false);
                if (onLogout) onLogout();
                else logoutSystem();
              }}
            >
              <ScenovaIcon name="logout" size={19}/>
              {elevated ? <span>ออกจากระบบ</span> : <span>{t("logout")}</span>}
            </button>
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
  onNavigate,
  onLogout,
  role = "OWNER"
}:{
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
  onLogout?:()=>void;
  role?:string;
}) {
  return <UnifiedMobileNav activeKey={activeKey} onNavigate={onNavigate} onLogout={onLogout} elevated role={role}/>;
}

export function CustomerMobileNav({
  activeKey,
  onNavigate,
  onLogout,
  partner
}:{
  activeKey:string;
  onNavigate?:SidebarNavigateHandler;
  onLogout?:()=>void;
  partner?:PartnerSummary;
}) {
  return <UnifiedMobileNav activeKey={activeKey} onNavigate={onNavigate} onLogout={onLogout} elevated={false} partner={partner}/>;
}
