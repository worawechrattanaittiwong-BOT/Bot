const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const path="apps/web/app/bot-inspection/page.tsx";
const source=fs.readFileSync(path,"utf8");
test("Bot Logs does not preselect first MT5 account on fresh page",()=>{
 assert(!source.includes('||rows[0]?.id'));
 assert.match(source,/setAccountId\(initial\s*\?\s*\(rows\.find\(a=>a\.id===initial\)\?\.id\|\|""\)\s*:\s*""\)/);
 assert(source.includes('<option value="">'));
 assert(source.includes('— เลือกบัญชี MT5 เพื่อตรวจสอบ —'));
});
test("filter and search never switch accounts without user choice",()=>{
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function functionText(name){
  let found;
  const walk=(n)=>{
   if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);
   ts.forEachChild(n,walk);
  };
  walk(ast);
  assert(found,"missing handler "+name);
  return found;
 }
 const filter=functionText("chooseFilter");
 const search=functionText("changeSearch");
 assert(filter.includes('setAccountId("");'));
 assert(!filter.includes("filtered[0]"));
 assert(search.includes('setAccountId("");'));
 assert(source.includes('const [accountId,setAccountId]=useState("");'));
 assert(!source.includes('styles.accountInfo'));
 assert(!source.includes('styles.matches'));
});
test("inspect remains disabled until an account is chosen",()=>{
 assert(source.includes('disabled={busy||!accountId}'));
 assert(source.includes('if(!accountId)return;'));
 assert(source.includes('requestVersion.current++;'));
});
