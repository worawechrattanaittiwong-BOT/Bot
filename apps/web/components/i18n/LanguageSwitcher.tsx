"use client";
import {useCustomerLanguage} from "../../lib/i18n/provider";
export function LanguageSwitcher(){
 const {lang,setLang}=useCustomerLanguage();
 return <div role="group" aria-label="Language / ภาษา" style={{display:"flex",gap:6}}>
  <button type="button" aria-pressed={lang==="th"} onClick={()=>setLang("th")}>🇹🇭 TH</button>
  <button type="button" aria-pressed={lang==="en"} onClick={()=>setLang("en")}>🇬🇧 EN</button>
 </div>
}
