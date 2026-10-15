import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root="apps/web";
const dict=JSON.parse(fs.readFileSync(path.join(root,"lib/i18n/customer-visible-translations.json"),"utf8"));
for(const [th,en] of Object.entries({"สัญญาณและสถานะ":"Signals and status","หยุด ปลอดภัย":"Safe Stop","ออเดอร์ที่กำลังรัน":"Running orders","จำนวนคำสั่งรอต่อฝั่ง":"Pending orders per side"})){ assert.equal(dict[th],en,`Dashboard translation regression: ${th}`) }
function walk(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?walk(full):[full];
 });
}
const routes=walk(path.join(root,"app")).filter(p=>p.endsWith("/page.tsx")&&!p.includes("/admin/"));
const components=walk(path.join(root,"components")).filter(p=>p.endsWith(".tsx")&&!p.toLowerCase().includes("admin"));
assert.ok(routes.length>=24,"Expected at least 24 non-admin customer/public routes");
assert.match(fs.readFileSync(path.join(root,"app/layout.tsx"),"utf8"),/CustomerVisibleTextTranslator/);
assert.match(fs.readFileSync(path.join(root,"components/i18n/CustomerLanguageDock.tsx"),"utf8"),/if\(admin\)return null/);
const missing=new Set();
let plain=0,quoted=0;
for(const file of [...routes,...components]){
 const source=fs.readFileSync(file,"utf8");
 for(const match of source.matchAll(/>\s*([^<>\n]+?)\s*</g)){
  const raw=match[1],key=raw.trim();
  if(raw.includes("{")||raw.includes("}")||!/[ก-๙]/.test(raw)||key.length<2||key.length>450)continue;
  plain++;
  if(!dict[key])missing.add(key);
 }
 for(const match of source.matchAll(/["']([^"'\n]{1,350}[ก-๙][^"'\n]{0,350})["']/g)){
  const key=match[1].trim();
  if(key.length<2||key.length>350||key.includes("{")||key.includes("}")||key.includes("=>")||key.includes("http")||key.includes("<"))continue;
  quoted++;
  if(!dict[key])missing.add(key);
 }
}
assert.deepEqual([...missing].sort(),[],"Missing public/customer Thai to English translations");
console.log("SCENOVA customer language coverage: PASS",routes.length,"routes",plain,"plain literals",quoted,"quoted literals",Object.keys(dict).length,"dictionary entries");
