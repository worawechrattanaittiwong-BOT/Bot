"use client";

import type { ReactNode } from "react";

export type ScenovaIconName =
  | "brand" | "control" | "overview" | "users" | "cloud" | "strategy"
  | "clock" | "report" | "settings" | "shield" | "book" | "chat" | "logout"
  | "wallet" | "equity" | "pnl" | "orders" | "gold" | "play" | "stop" | "close"
  | "trend" | "target" | "spread" | "hourglass" | "status" | "account" | "copy"
  | "refresh" | "bot" | "brain" | "risk" | "timer" | "profit" | "save" | "bell"
  | "layers" | "lot" | "spark" | "info" | "arrow-up" | "arrow-down";

function P({children}:{children:ReactNode}) {
  return <>{children}</>;
}

export function ScenovaIcon({name,size=18,className=""}:{name:ScenovaIconName|string;size?:number;className?:string}) {
  const common = {
    width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",
    strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,className,
    "aria-hidden":true
  };
  let body:ReactNode;
  switch(name){
    case "brand": body=<P><path d="M12 2.4 21.6 12 12 21.6 2.4 12 12 2.4Z"/><path d="m7.2 9.2 3-3h5.4l1.4 1.4-3 3h-4l-2.8 2.8 3.4 3.4h3.2l3-3"/><path d="M14.2 4.9H19v4.8M19 4.9l-6.2 6.2"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/></P>;break;
    case "control": body=<P><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12h8M12 8v8"/><circle cx="12" cy="12" r="5"/></P>;break;
    case "overview": body=<P><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></P>;break;
    case "users": body=<P><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></P>;break;
    case "cloud": body=<P><path d="M17.5 19H7a5 5 0 0 1-.7-9.95A7 7 0 0 1 19.7 11 4 4 0 0 1 17.5 19Z"/></P>;break;
    case "strategy": body=<P><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 15 3-3 2 2 5-5"/><path d="M16 9h2v2"/></P>;break;
    case "clock":
    case "timer": body=<P><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></P>;break;
    case "report": body=<P><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></P>;break;
    case "settings": body=<P><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.12-1.3l2-1.55-2-3.45-2.46 1A7 7 0 0 0 14.2 5.4L13.8 3h-4l-.4 2.4A7 7 0 0 0 7.2 6.7l-2.45-1-2 3.45 2 1.55A7 7 0 0 0 4.6 13l-2 1.55 2 3.45 2.45-1a7 7 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.45 1 2-3.45-2-1.55A7 7 0 0 0 19 12Z"/></P>;break;
    case "shield":
    case "risk": body=<P><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z"/><path d="m9 12 2 2 4-5"/></P>;break;
    case "book": body=<P><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13"/></P>;break;
    case "chat": body=<P><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h8M8 14h5"/></P>;break;
    case "logout": body=<P><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></P>;break;
    case "wallet": body=<P><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M16 11h4v4h-4a2 2 0 0 1 0-4Z"/></P>;break;
    case "equity": body=<P><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6M7 17h8"/></P>;break;
    case "pnl": body=<P><path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/></P>;break;
    case "orders":
    case "layers": body=<P><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></P>;break;
    case "gold": body=<P><path d="m4 14 3-6h6l-3 6z"/><path d="m10 14 3-6h6l3 6z"/><path d="M6 14h12l2 5H4z"/></P>;break;
    case "play": body=<P><path d="m8 5 11 7-11 7z"/></P>;break;
    case "stop": body=<P><rect x="6" y="6" width="12" height="12" rx="2"/></P>;break;
    case "close": body=<P><path d="M6 6l12 12M18 6 6 18"/></P>;break;
    case "trend": body=<P><path d="m3 17 6-6 4 4 7-8"/><path d="M15 7h5v5"/></P>;break;
    case "target": body=<P><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></P>;break;
    case "spread": body=<P><path d="M8 7 4 12l4 5M16 7l4 5-4 5M4 12h16"/></P>;break;
    case "hourglass": body=<P><path d="M6 3h12M6 21h12M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/></P>;break;
    case "status": body=<P><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></P>;break;
    case "account": body=<P><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="10" r="2"/><path d="M5.5 16c.8-2 4.2-2 5 0M13 9h5M13 13h5"/></P>;break;
    case "copy": body=<P><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></P>;break;
    case "refresh": body=<P><path d="M20 6v5h-5M4 18v-5h5"/><path d="M7 7a7 7 0 0 1 11 2M17 17A7 7 0 0 1 6 15"/></P>;break;
    case "bot":
    case "brain": body=<P><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M9 7V5a3 3 0 0 1 6 0v2M8 12h.01M16 12h.01M9 16h6"/><path d="M2 12h2M20 12h2"/></P>;break;
    case "profit": body=<P><path d="M4 18 9 13l4 3 7-9"/><path d="M15 7h5v5"/></P>;break;
    case "save": body=<P><path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></P>;break;
    case "bell": body=<P><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></P>;break;
    case "lot": body=<P><path d="M4 19V8M9 19V5M14 19v-8M19 19V3"/><path d="M2 19h20"/></P>;break;
    case "spark": body=<P><path d="m13 2-2 7h6l-7 13 2-9H6z"/></P>;break;
    case "info": body=<P><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></P>;break;
    case "arrow-up": body=<P><path d="m6 15 6-6 6 6"/></P>;break;
    case "arrow-down": body=<P><path d="m6 9 6 6 6-6"/></P>;break;
    default: body=<P><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></P>;
  }
  return <svg {...common}>{body}</svg>;
}
