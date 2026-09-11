"use client";

import Link from "next/link";
import { ScenovaIcon } from "./ScenovaIcon";
import { ScenovaBrand } from "./ScenovaBrand";

export const ownerNavItems = [
  { section:"TRADING", key:"trading-overview", href:"/dashboard?view=overview", icon:"control", label:"Control Center", hint:"ภาพรวมและควบคุมการทำงานของบอท" },
  { section:"TRADING", key:"trading-account", href:"/dashboard?view=account", icon:"account", label:"MT5 & EA", hint:"เชื่อมต่อและจัดการบัญชี Local / Cloud" },
  { section:"TRADING", key:"admin-workers", href:"/admin?view=workers", icon:"cloud", label:"Cloud Trading", hint:"จัดการ Trading Nodes และระบบประมวลผล" },
  { section:"TRADING", key:"trading-backtest", href:"/dashboard?view=backtest", icon:"strategy", label:"Backtest & Performance", hint:"ผลทดสอบย้อนหลัง สถิติ และการวิเคราะห์" },
  { section:"MANAGEMENT", key:"admin-customers", href:"/admin?view=customers", icon:"users", label:"Customers & Memberships", hint:"Trial, subscriptions และสิทธิ์การใช้งาน" },
  { section:"MANAGEMENT", key:"trading-access", href:"/dashboard?view=access", icon:"shield", label:"Access & Permissions", hint:"บทบาทและขอบเขตการเข้าถึงระบบ" },
  { section:"SYSTEM", key:"admin-overview", href:"/admin?view=overview", icon:"overview", label:"System Overview", hint:"สถานะและสุขภาพโดยรวมของแพลตฟอร์ม" },
  { section:"SYSTEM", key:"website", href:"/", icon:"strategy", label:"Main Website", hint:"SCENOVA public website" }
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
  const sections = ["TRADING","MANAGEMENT","SYSTEM"] as const;
  return (
    <aside className="sidebar app-sidebar owner-sidebar">
      <div className="brand-lockup side-brand scenova-brand-lockup">
        <ScenovaBrand className="scenova-brand-logo-sidebar"/>
      </div>

      {sections.map(section=>(
        <div key={section}>
          <div className={"owner-nav-label " + (section!=="TRADING" ? "owner-nav-label-secondary" : "")}>{section}</div>
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
        <div><small>System Role</small><b>OWNER</b></div>
        <span className="dot green"/>
      </div>
      <button type="button" className="btn ghost full owner-logout" onClick={onLogout}><ScenovaIcon name="logout" size={18}/>Sign Out</button>
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
