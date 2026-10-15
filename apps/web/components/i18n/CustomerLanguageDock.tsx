"use client";
import {usePathname} from "next/navigation";
import {useEffect} from "react";
import {useCustomerLanguage} from "../../lib/i18n/provider";
import {LanguageSwitcher} from "./LanguageSwitcher";
export function CustomerLanguageDock(){
 const path=usePathname();
 const {lang}=useCustomerLanguage();
 const admin=path==="/admin" || path.startsWith("/admin/");
 useEffect(()=>{if(!admin)document.documentElement.lang=lang;else document.documentElement.lang="th"},[admin,lang]);
 if(admin || path==="/dashboard")return null;
 return <div data-scenova-language-dock style={{position:"fixed",top:12,right:12,zIndex:10000,padding:"6px 8px",border:"1px solid rgba(148,120,241,.6)",borderRadius:12,background:"rgba(15,13,30,.94)",color:"#fff",boxShadow:"0 8px 24px rgba(0,0,0,.35)"}}>
 <LanguageSwitcher/>
 </div>
}
