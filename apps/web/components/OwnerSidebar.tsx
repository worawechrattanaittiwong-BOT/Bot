"use client";

import Link from "next/link";
import { ScenovaIcon } from "./ScenovaIcon";
import { ScenovaBrand } from "./ScenovaBrand";

export const ownerNavItems = [
  { section:"WORKSPACE", key:"admin-overview", href:"/admin?view=overview", icon:"overview", label:"ภาพรวมระบบ", hint:"สุขภาพระบบ" },
  { section:"WORKSPACE", key:"admin-customers", href:"/admin?view=customers", icon:"users", label:"ลูกค้า & สมาชิก", hint:"Trial, Access, แพ็กเกจ" },
  { section:"WORKSPACE", key:"admin-workers", href:"/admin?view=workers", icon:"cloud", label:"Cloud", hint:"Trading Nodes" },
  { section:"MY TRADING", key:"trading-overview", href:"/dashboard?view=overview", icon:"control", label:"Control Center", hint:"ภาพรวมและควบคุมบอท" },
  { section:"MY TRADING", key:"trading-account", href:"/dashboard?view=account", icon:"account", label:"บัญชี MT5 & EA", hint:"เชื่อมบัญชี Local / Cloud" },
  { section:"MY TRADING", key:"trading-access", href:"/dashboard?view=access", icon:"shield", label:"สิทธิ์ใช้งานของฉัน", hint:"OWNER · Unlimited Access" },
  { section:"MY TRADING", key:"trading-backtest", href:"/dashboard?view=backtest", icon:"strategy", label:"Backtest & Performance", hint:"ผลย้อนหลัง ดาวน์โหลด และแชร์ตัวอย่าง" },
  { section:"PUBLIC", key:"website", href:"/", icon:"strategy", label:"หน้าเว็บไซต์", hint:"หน้าแรก SCENOVA" }
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
      <div className="brand-lockup side-brand scenova-brand-lockup">
        <ScenovaBrand className="scenova-brand-logo-sidebar"/>
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
                <span className="owner-nav-icon"><ScenovaIcon name={item.icon} size={19}/></span>
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
      <button type="button" className="btn ghost full owner-logout" onClick={onLogout}><ScenovaIcon name="logout" size={18}/>ออกจากระบบ</button>
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
