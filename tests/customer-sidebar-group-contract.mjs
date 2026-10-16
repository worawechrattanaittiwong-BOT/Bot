import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar=readFileSync("apps/web/components/OwnerSidebar.tsx","utf8");
const css=readFileSync("apps/web/app/globals.css","utf8");
const groupSection=sidebar.match(/const customerMenuGroups = \[([\s\S]*?)\] as const;/)?.[1] || "";
const groups=[...groupSection.matchAll(/key:"([^"]+)", icon:"([^"]+)", label:"([^"]+)", keys:\[([^\]]+)\]/g)]
  .map(m=>({key:m[1],label:m[3],keys:[...m[4].matchAll(/"([^"]+)"/g)].map(x=>x[1])}));

assert.equal(groups.length,5,"Five expandable customer groups plus standalone Control Center");
assert.deepEqual(groups.map(g=>g.label),[
  "MT5 & Accounts","Trading Strategies","Performance & Reports","Rewards & Wallet","My Account"
]);
const expected=["trading-account","broker-center","trading-fleet-monitor","follow-master",
  "trading-backtest","bot-inspection","referrals","my-account","packages","partner-dashboard"];
const actual=groups.flatMap(g=>g.keys);
assert.deepEqual([...actual].sort(),[...expected].sort(),"All customer destinations and partner-only link retained without duplicates");
assert.equal(new Set(actual).size,actual.length);
assert.ok(!actual.includes("trading-overview"),"Control Center remains a standalone primary link");
assert.match(sidebar,/items\.find\(item=>item\.key==="trading-overview"\)/);
assert.match(sidebar,/groups\.map\(group=>/);
assert.match(sidebar,/aria-expanded=\{opened\}/);
assert.match(sidebar,/aria-controls=\{/);
assert.match(sidebar,/hidden=\{!opened\}/);
assert.match(sidebar,/if\(currentGroup\)setExpanded\(currentGroup\)/);
assert.match(sidebar,/onNavigate\?\.\(href\)===true/);
assert.match(sidebar,/onChoose\?\.\(\)/);
assert.match(sidebar,/!groupedSidebar \? sections\.map\(section=>\(/g);
assert.match(sidebar,/showLanguageControl=\{showLanguageControl\}/);
assert.match(sidebar,/owner=\{elevated\}/);
assert.match(sidebar,/mobile onChoose=\{\(\)=>setOpen\(false\)\}/);
assert.match(css,/\.customer-nav-children\[hidden\]\s*\{\s*display:none!important/);
assert.match(css,/\.customer-role-sidebar \.(?:customer-nav-groups)/);
assert.match(css,/\.owner-mobile-drawer \.(?:customer-nav-groups-mobile)/);
assert.match(css,/\.owner-sidebar\.elevated-sidebar \.owner-nav-groups/);
// Regression: OWNER (the original screenshot role) must get a grouped menu.
const ownerGroupSection=sidebar.match(/const ownerMenuGroups = \[([\s\S]*?)\] as const;/)?.[1] || "";
const ownerGroups=[...ownerGroupSection.matchAll(/key:"([^"]+)", icon:"([^"]+)", label:"([^"]+)", keys:\[([^\]]+)\]/g)]
  .map(m=>({key:m[1],label:m[3],keys:[...m[4].matchAll(/"([^"]+)"/g)].map(x=>x[1])}));
assert.deepEqual(ownerGroups.map(x=>x.label),[
  "MT5 & Accounts","Trading Strategies","Performance & Reports",
  "Rewards & Wallet","Account & Members","Advanced Settings"
]);
const ownerExpected=["trading-account","broker-center","trading-fleet-monitor","admin-workers",
  "follow-master","trading-modes","trading-backtest","bot-inspection","referrals",
  "commission-withdrawals","promotion-center","my-account","admin-customers",
  "admin-overview","service-links","cloud-hardening","website"];
const ownerActual=ownerGroups.flatMap(x=>x.keys);
assert.deepEqual([...ownerActual].sort(),[...ownerExpected].sort(),"OWNER must retain all 17 secondary destinations");
assert.equal(new Set(ownerActual).size,17);
assert.match(sidebar,/role\.toUpperCase\(\) === "OWNER"/);
assert.match(sidebar,/const groupedSidebar = !elevated \|\| role\.toUpperCase\(\) === "OWNER"/);
assert.match(sidebar,/owner=\{elevated\}/);
assert.match(sidebar,/const groupedSidebar = !elevated \|\| String\(role \|\| "OWNER"\)\.toUpperCase\(\) === "OWNER"/);
// Existing account, owner and admin filtering/destinations remain source-of-truth.
assert.match(sidebar,/elevated \? \[\.\.\.ownerNavItems\] : \[\.\.\.customerNavItems\]/);
assert.match(sidebar,/if \(!elevated && partner\)/);
assert.match(sidebar,/href:"\/admin\/commission"/);
assert.match(sidebar,/href:"\/admin\/trading-modes"/);
console.log("SCENOVA customer+owner sidebar contract: PASS; customer 10 and owner 17 links intact");
