import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire, Module } from "node:module";

const source=resolve("apps/web/components/OwnerSidebar.tsx");
const require=createRequire(source);
const React=require("react");
const {renderToStaticMarkup}=require("react-dom/server");
const ts=require("typescript");
let pathname="/dashboard";
const stubLink=({href,children,prefetch,...rest})=>React.createElement("a",{href,...rest},children);
const stubIcon=()=>React.createElement("span",{"aria-hidden":"true"},"•");
const stubBrand=()=>React.createElement("span",null,"SCENOVA");
const stubLang=()=>React.createElement("span",{"data-locale":true},"TH EN");
const mocks={
  "next/link":{__esModule:true,default:stubLink},
  "next/navigation":{usePathname:()=>pathname},
  "./ScenovaIcon":{ScenovaIcon:stubIcon},
  "./ScenovaBrand":{ScenovaBrand:stubBrand},
  "./InAppCampaignHost":{InAppCampaignHost:()=>null},
  "./i18n/LanguageSwitcher":{LanguageSwitcher:stubLang},
  "../lib/i18n/provider":{useCustomerLanguage:()=>({
    lang:"th",t:(key,fallback)=>key==="trading-account"?"บัญชี MT5 และ EA":fallback||key
  })}
};
const js=ts.transpileModule(readFileSync(source,"utf8"),{
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
}).outputText;
const mod=new Module(source);
mod.filename=source;
mod.paths=Module._nodeModulePaths(resolve("apps/web/components"));
const nativeRequire=mod.require.bind(mod);
mod.require=id=>mocks[id]??nativeRequire(id);
mod._compile(js,source);
const {OwnerSidebar,CustomerSidebar}=mod.exports;
function render(Component,props={}) {
  return renderToStaticMarkup(React.createElement(Component,{
    activeKey:"trading-overview",onLogout:()=>{},...props
  }));
}
// The real broken case: OWNER on /dashboard must show grouped navigation.
pathname="/dashboard";
const owner=render(OwnerSidebar,{role:"OWNER"});
assert.match(owner,/owner-nav-groups/,"OWNER dashboard must show grouped sidebar");
assert.match(owner,/MT5 &amp; Accounts/);
assert.match(owner,/Advanced Settings/);
assert.match(owner,/Account &amp; Members/);
assert.match(owner,/MT5 &amp; EA/,"OWNER TH-mixed labels retain old English wording");
assert.doesNotMatch(owner,/บัญชี MT5 และ EA/,"OWNER Thai labels must not be rewritten");
assert.doesNotMatch(owner,/owner-nav-label-secondary/,"OWNER dashboard must not use legacy section list");
for(const href of ["/dashboard?view=account","/broker","/fleet-monitor",
  "/admin?view=customers","/admin/commission","/admin/promotions",
  "/admin?view=workers","/admin/trading-modes","/admin/cloud-hardening"]) {
  assert.ok(owner.includes('href="'+href.replaceAll("&","&amp;")+'"'),"OWNER route missing: "+href);
}
const ownerSelected=render(OwnerSidebar,{role:"OWNER",activeKey:"commission-withdrawals"});
assert.match(ownerSelected,/id="customer-desktop-menu-rewards"/);
assert.match(ownerSelected,/class="customer-nav-group has-active expanded"/);
// Navigate to every Owner Console route: the grouped sidebar must never
// revert to TRADING / MANAGEMENT / SYSTEM when Next.js changes pathname.
const ownerPages=[
  ["/dashboard","trading-overview","Control Center"],
  ["/admin","admin-overview","Advanced Settings"],
  ["/admin","admin-workers","MT5 & Accounts"],
  ["/admin","admin-customers","Account &amp; Members"],
  ["/admin/promotions","promotion-center","Rewards &amp; Wallet"],
  ["/admin/commission","commission-withdrawals","Rewards &amp; Wallet"],
  ["/admin/trading-modes","trading-modes","Trading Strategies"],
  ["/admin/service-links","service-links","Advanced Settings"],
  ["/admin/cloud-hardening","cloud-hardening","Advanced Settings"]
];
for(const [route,key,groupLabel] of ownerPages) {
  pathname=route;
  // Most /admin pages invoke <OwnerSidebar> without passing role.
  const html=render(OwnerSidebar,{activeKey:key});
  assert.match(html,/owner-nav-groups/,"Grouped Owner sidebar missing on "+route+" / "+key);
  assert.doesNotMatch(html,/owner-nav-label-secondary/,"Legacy sidebar reappeared on "+route+" / "+key);
  assert.ok(html.includes(groupLabel.replaceAll("& ","&amp; ")),"Owner menu group missing on "+route+" / "+key);
  if(key==="trading-overview") assert.match(html,/customer-nav-primary active/,"Control Center stays selected");
  else assert.match(html,/customer-nav-group has-active expanded/,"Active section must open on "+route+" / "+key);
  assert.equal((html.match(/customer-nav-primary-text/g)||[]).length,7,
    "Owner navigation must show 6 groups plus Control Center on "+route+" / "+key);
}
// Admin retains its original ungrouped sidebar on admin routes.
pathname="/admin";
const admin=render(OwnerSidebar,{role:"ADMIN"});
assert.doesNotMatch(admin,/owner-nav-groups/);
assert.match(admin,/owner-nav-label-secondary/);
pathname="/dashboard";
const customer=render(CustomerSidebar);
assert.match(customer,/customer-nav-groups/);
assert.match(customer,/My Account/);
assert.match(customer,/บัญชี MT5 และ EA/,"CUSTOMER TH translation preserved");
assert.doesNotMatch(customer,/Advanced Settings/);
console.log("OWNER grouped across 9 page/view combinations; ADMIN legacy preserved with explicit role; CUSTOMER intact: PASS");
