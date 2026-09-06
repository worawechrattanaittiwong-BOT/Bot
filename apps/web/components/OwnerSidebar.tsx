"use client";

import Link from "next/link";

export const ownerNavItems = [
  { section:"WORKSPACE", key:"admin-overview", href:"/admin?view=overview", icon:"◫", label:"ภาพรวมระบบ", hint:"สุขภาพระบบ" },
  { section:"WORKSPACE", key:"admin-customers", href:"/admin?view=customers", icon:"◎", label:"ลูกค้า & สมาชิก", hint:"Trial, Access, แพ็กเกจ" },
  { section:"WORKSPACE", key:"admin-workers", href:"/admin?view=workers", icon:"⌁", label:"Cloud", hint:"Trading Nodes" },
  { section:"MY TRADING", key:"trading-overview", href:"/dashboard?view=overview", icon:"▣", label:"Control Center", hint:"Balance, Status, Start / Stop" },
  { section:"MY TRADING", key:"trading-account", href:"/dashboard?view=account", icon:"M", label:"บัญชี MT5 & EA", hint:"เชื่อมบัญชี, Local / Cloud, .set" },
  { section:"MY TRADING", key:"trading-settings", href:"/dashboard?view=settings", icon:"⚙", label:"ตั้งค่าบอท", hint:"Lot, Risk, Entry, Basket" },
  { section:"MY TRADING", key:"trading-access", href:"/dashboard?view=access", icon:"A", label:"สิทธิ์ใช้งานของฉัน", hint:"OWNER · Unlimited Access" },
  { section:"PUBLIC", key:"website", href:"/", icon:"↗", label:"หน้าเว็บไซต์", hint:"หน้าแรก SCENOVA" }
] as const;

type OwnerNavigateHandler = (href:string)=>boolean | void;

export function OwnerSidebar({
  activeKey,
  onLogout,
  onNavigate
}:{
  activeKey:string;
  onLogout:()=>void;
  onNavigate?:OwnerNavigateHandler;
}) {
  const sections = ["WORKSPACE","MY TRADING","PUBLIC"] as const;
  return (
    <aside className="sidebar app-sidebar owner-sidebar">
      <div className="brand-lockup side-brand">
        <span className="brand-mark">◆</span>
        <span><strong>SCENOVA</strong><small>OWNER CONSOLE</small></span>
      </div>

      {sections.map(section=>(
        <div key={section}>
          <div className={"owner-nav-label " + (section!=="WORKSPACE" ? "owner-nav-label-secondary" : "")}>{section}</div>
          <nav className="side-nav owner-nav">
            {ownerNavItems.filter(item=>item.section===section).map(item=>(
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
                <span className="owner-nav-icon">{item.icon}</span>
                <span className="owner-nav-copy"><b>{item.label}</b><small>{item.hint}</small></span>
                <span className="owner-nav-caret">›</span>
              </Link>
            ))}
          </nav>
        </div>
      ))}

      <div className="owner-profile">
        <div className="owner-avatar">O</div>
        <div><small>System role</small><b>OWNER</b></div>
        <span className="dot green"/>
      </div>
      <button type="button" className="btn ghost full" onClick={onLogout}>ออกจากระบบ</button>
    </aside>
  );
}

export function OwnerMobileNav({
  activeKey,
  onNavigate
}:{
  activeKey:string;
  onNavigate?:OwnerNavigateHandler;
}) {
  return (
    <div className="mobile-only mobile-nav owner-mobile-nav">
      {ownerNavItems.map(item=>(
        <Link
          key={item.key}
          href={item.href}
          prefetch
          aria-current={activeKey===item.key ? "page" : undefined}
          className={activeKey===item.key ? "active" : ""}
          onClick={(event)=>{
            if (onNavigate?.(item.href) === true) event.preventDefault();
          }}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
