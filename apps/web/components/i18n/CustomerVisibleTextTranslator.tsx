"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {useCustomerLanguage} from "../../lib/i18n/provider";
import {translateEnglishCopy} from "../../lib/i18n/english-mixed-copy";

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
  const translateText=(text:Text)=>{
    const parent=text.parentElement;
    if(!parent||blocked.has(parent.tagName)||parent.closest("[data-i18n-no-auto], [contenteditable='true']"))return;
    const current=text.nodeValue||"";
    const previous=originalText.get(text);
    if(previous && current!==previous.th && current!==previous.en)originalText.delete(text);
    let record=originalText.get(text);
    if(!record){
      const key=current.trim();
      if(!key||!/[ก-๙]/.test(key))return;
      const en=translateEnglishCopy(current);
      if(en===current)return;
      record={th:current,en};
      originalText.set(text,record);
    }
    const next=lang==="en"?record.en:record.th;
    if(current!==next)text.nodeValue=next;
  };
  const translateAttributes=(element:Element)=>{
    if(element.closest("[data-i18n-no-auto]"))return;
    let records=originalAttrs.get(element);
    if(!records){records={};originalAttrs.set(element,records)}
    attrNames.forEach(attr=>{
      const current=element.getAttribute(attr);
      if(!current)return;
      const prior=records[attr];
      if(prior && current!==prior && current!==translateEnglishCopy(prior))delete records[attr];
      if(!records[attr]){
        if(translateEnglishCopy(current)!==current)records[attr]=current;
        else return;
      }
      const next=lang==="en"?translateEnglishCopy(records[attr]):records[attr];
      if(next&&current!==next)element.setAttribute(attr,next);
    });
  };
  const translateSubtree=(root:Node)=>{
    if(root.nodeType===Node.TEXT_NODE){translateText(root as Text);return}
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    const element=root as Element;
    if(element.closest("[data-i18n-no-auto]"))return;
    translateAttributes(element);
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    let node:Node|null;
    while((node=walker.nextNode()))translateText(node as Text);
    element.querySelectorAll("[placeholder],[title],[aria-label]").forEach(translateAttributes);
  };
  translateSubtree(document.body);
  const pending=new Set<Node>();
  const schedule=(mutations:MutationRecord[])=>{
    if(stopped)return;
    mutations.forEach(mutation=>{
      if(mutation.type==="characterData"||mutation.type==="attributes")pending.add(mutation.target);
      else mutation.addedNodes.forEach(node=>pending.add(node));
    });
    if(scheduled||pending.size===0)return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      const nodes=[...pending];pending.clear();
      if(!stopped)nodes.forEach(translateSubtree);
    });
  };
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attrNames]});
  return ()=>{stopped=true;observer.disconnect()};
 },[pathname,lang]);
 return null;
}
