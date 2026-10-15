"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {useCustomerLanguage} from "../../lib/i18n/provider";
import translated from "../../lib/i18n/customer-visible-translations.json";

const dictionary:Record<string,string> = translated as Record<string,string>;
const originalText = new WeakMap<Text,{th:string;en:string}>();
const originalAttrs = new WeakMap<Element,Record<string,string>>();
const blocked = new Set(["SCRIPT","STYLE","CODE","PRE","TEXTAREA","NOSCRIPT"]);
const attrNames = ["placeholder","title","aria-label"] as const;

export function CustomerVisibleTextTranslator(){
 const pathname=usePathname();
 const {lang}=useCustomerLanguage();
 useEffect(()=>{
  if(pathname==="/admin"||pathname.startsWith("/admin/"))return;
  let stopped=false;
  let scheduled=false;
  const translateTree=()=>{
   if(stopped)return;
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   let node:Node|null;
   while((node=walker.nextNode())){
    const text=node as Text;
    const parent=text.parentElement;
    if(!parent||blocked.has(parent.tagName)||parent.closest("[data-i18n-no-auto], [contenteditable='true']"))continue;
    const current=text.nodeValue||"";
    const previous=originalText.get(text);
    if(previous && current!==previous.th && current!==previous.en)originalText.delete(text);
    let record=originalText.get(text);
    if(!record){
     const key=current.trim();
     const en=dictionary[key];
     if(!en||!key)continue;
     record={th:current,en:current.replace(key,en)};
     originalText.set(text,record);
    }
    const next=lang==="en"?record.en:record.th;
    if(current!==next)text.nodeValue=next;
   }
   document.querySelectorAll("[placeholder],[title],[aria-label]").forEach(element=>{
    if(element.closest("[data-i18n-no-auto]"))return;
    let records=originalAttrs.get(element);
    if(!records){records={};originalAttrs.set(element,records)}
    attrNames.forEach(attr=>{
     const current=element.getAttribute(attr);
     if(!current)return;
     const prior=records[attr];
     if(prior && current!==prior && current!==dictionary[prior])delete records[attr];
     if(!records[attr]){
      if(dictionary[current])records[attr]=current;
      else return;
     }
     const next=lang==="en"?dictionary[records[attr]]:records[attr];
     if(next&&current!==next)element.setAttribute(attr,next);
    });
   });
  };
  const schedule=()=>{
   if(scheduled||stopped)return;
   scheduled=true;
   queueMicrotask(()=>{scheduled=false;translateTree()});
  };
  translateTree();
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attrNames]});
  return ()=>{stopped=true;observer.disconnect()};
 },[pathname,lang]);
 return null;
}
