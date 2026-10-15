"use client";
import {createContext,useContext,useEffect,useState} from "react";
export type Lang="th"|"en";
const texts:Record<string,[string,string]>={
"TRADING":["การเทรด","Trading"],"MANAGEMENT":["การจัดการ","Management"],"SYSTEM":["ระบบ","System"],
"trading-overview":["ศูนย์ควบคุม","Control Center"],"trading-account":["บัญชี MT5 และ EA","MT5 & EA"],
"follow-master":["ติดตามมาสเตอร์","Follow Master"],"trading-fleet-monitor":["ติดตามบัญชีเทรด","Trading Fleet Monitor"],
"bot-inspection":["บันทึกบอท","Bot Logs"],"trading-backtest":["ผลการเทรดและทดสอบย้อนหลัง","Backtest & Performance"],
"my-account":["บัญชีของฉัน","My Account"],"packages":["แพ็กเกจ","Packages"],
"broker-center":["โบรกเกอร์","Broker"],"referrals":["เชิญเพื่อนรับรางวัล","Invite & Earn"],
"partner-dashboard":["แดชบอร์ดพาร์ทเนอร์","Partner Dashboard"],
"logout":["ออกจากระบบ","Sign Out"],"menu":["เมนู","Menu"],"userId":["รหัสผู้ใช้","User ID"],
"success":["สำเร็จ","Success"],"error":["ดำเนินการไม่สำเร็จ","Action failed"],
"warning":["โปรดยืนยัน","Please confirm"],"confirm":["ยืนยัน","Confirm"],
"cancel":["ยกเลิก","Cancel"],"copy":["คัดลอก","Copy"],"close":["ปิด","Close"]
};
const C=createContext<{lang:Lang;setLang:(l:Lang)=>void;t:(key:string,fallback?:string)=>string}|null>(null);
export function CustomerLanguageProvider({children}:{children:React.ReactNode}){
 const [lang,setState]=useState<Lang>("th");
 useEffect(()=>{const v=localStorage.getItem("scenova-customer-lang");if(v==="th"||v==="en")setState(v)},[]);
 const setLang=(v:Lang)=>{setState(v);localStorage.setItem("scenova-customer-lang",v)};
 const t=(key:string,fallback=key)=>texts[key]?.[lang==="th"?0:1]||fallback;
 return <C.Provider value={{lang,setLang,t}}>{children}</C.Provider>
}
export function useCustomerLanguage(){const ctx=useContext(C);if(!ctx)throw Error("Missing CustomerLanguageProvider");return ctx}
