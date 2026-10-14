const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync("apps/api/src/brokers/exness-account-details.service.ts","utf8");
const controller=fs.readFileSync("apps/api/src/brokers/broker-automation.controller.ts","utf8");
const app=fs.readFileSync("apps/api/src/app.module.ts","utf8");
const ui=fs.readFileSync("apps/web/app/broker/page.tsx","utf8");
const rebateUi=fs.readFileSync("apps/web/components/ExnessRebateControl.tsx","utf8");
assert(controller.includes('@Get("client-account-details/:userId")'));
assert(controller.includes("@UseGuards(AdminGuard)"));
assert(app.includes("ExnessAccountDetailsService"));
assert(ui.includes("ดูบัญชีเทรด"));
assert(ui.includes("ไม่พบในรายงาน IB เรา"));
assert(ui.includes("Rebate ของบัญชีนี้"));
assert(rebateUi.includes("mobileClientCards"));
assert(rebateUi.includes('setDestination(String(row.destination_client_account||""))'));
assert(!source.includes("UPDATE broker_partner_clients"));
assert(!source.includes("mutateRebate"));
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}}).outputText;
class Invalid extends Error {}
const ctx={exports:{},Date,Math,Number,String,Set,Map,URLSearchParams,RegExp,JSON,Array,Object,
 require:(name)=>name==="@nestjs/common"?{Injectable:()=>v=>v,BadRequestException:Invalid,NotFoundException:Invalid}:{}};
vm.runInNewContext(js,ctx);
const Service=ctx.exports.ExnessAccountDetailsService;
const USER="11111111-1111-4111-8111-111111111111";
const db={
 async one(query,args) {
  assert.match(query,/FROM users/);
  return args[0]===USER?{user_code:"BOT-TEST"}:null;
 },
 async query(query,args) {
  assert.match(query,/FROM mt5_accounts/);
  assert.equal(args[0],USER);
  return {rows:[
   {id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",account_number:"266078974",broker_server:"Exness-MT5Real",status:"CONNECTED"},
   {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",account_number:"263625345",broker_server:"Exness-MT5Real",status:"CONNECTED"},
   {id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",account_number:"29000101424",broker_server:"Exness-MT5Real",status:"CONNECTED"}
  ]};
 }
};
let paths=[];
const raw=[...Array.from({length:40},(_,i)=>({client_account:String(80000000+i)})),
 {client_account:"266078974"}, {client_account:"263625345"}];
const exness={
 state:async()=>({clientReportPath:"/api/reports/clients/accounts/"}),
 authenticate:async()=>"FAKE_ONLY",
 request:async(path,token)=>{
  paths.push(path);
  assert.equal(token,"FAKE_ONLY");
  const offset=Number(new URL("https://mock.invalid"+path).searchParams.get("offset"));
  return {count:raw.length,data:raw.slice(offset,offset+40)};
 },
 arrayFromPayload:p=>p.data
};
let rebateReads=0;
const rebate={
 read:async(name,limit,offset)=>{
  assert.equal(name,"clients");
  rebateReads++;
  return {count:2,total:2,shapeValid:true,hasNext:false,rows:offset===0?[
   {client_account:"266078974",destination_client_account:"266078974",rebate_percent:20,rebate_group_title:"Standard",processed_rebate_usd:2.5},
   {client_account:"263625345",destination_client_account:"266078974",rebate_percent:30,rebate_group_title:"Standard",processed_rebate_usd:4}
  ]:[]};
 }
};
(async()=>{
 const svc=new Service(db,exness,rebate);
 await assert.rejects(()=>svc.forClient("no"),/รหัสลูกค้า/);
 const out=await svc.forClient(USER);
 assert.equal(out.partnerReport.complete,true);
 assert.equal(out.rebateReport.complete,true);
 assert.equal(out.accounts.length,3);
 assert.equal(out.accounts[0].partnerMatch,"FOUND");
 assert.equal(out.accounts[1].partnerMatch,"FOUND");
 assert.equal(out.accounts[2].partnerMatch,"NOT_FOUND");
 assert.equal(out.accounts[0].rebate.destinationIsSource,true);
 assert.equal(out.accounts[1].rebate.destinationIsSource,false);
 assert.equal(out.accounts[0].rebate.destinationLast4,"8974");
 assert.equal(out.accounts[1].rebate.percent,30);
 assert.equal(out.accounts[2].rebate.state,"NOT_FOUND");
 assert.equal(paths.length,2,"must paginate client report to avoid false not-found");
 assert.equal(rebateReads,1);
 assert(!JSON.stringify(out).includes("266078974"),"never expose full MT5 login");
 // Existing partial findings should remain FOUND even if Exness fails on a later page.
 let partialPages=0;
 const partialExness={...exness,
  request:async(_path)=>{
    partialPages++;
    if (partialPages===1) return {count:75,data:[...raw.slice(0,39),{client_account:"266078974"}]};
    throw Error("Rate limit while fetching page 2");
  }
 };
 const partial=await new Service(db,partialExness,rebate).forClient(USER);
 assert.equal(partial.partnerReport.complete,false);
 assert.equal(partial.accounts[0].partnerMatch,"FOUND");
 assert.equal(partial.accounts[1].partnerMatch,"UNAVAILABLE");
 // Explicit next-page must be honored even when an upstream count looks complete.
 const nextExness={...exness,request:async path=>{
    const offset=Number(new URL("https://mock.invalid"+path).searchParams.get("offset"));
    return offset===0
      ? {count:3,next:"NEXT",data:[{client_account:"263625345"},{client_account:"12345678"}]}
      : {count:3,next:null,data:[{client_account:"266078974"}]};
 }};
 const paged=await new Service(db,nextExness,rebate).forClient(USER);
 assert.equal(paged.partnerReport.complete,true);
 assert.equal(paged.accounts[0].partnerMatch,"FOUND");
 // API schema drift must not masquerade as a definitive absence.
 const unexpected=new Service(db,{...exness,request:async()=>({message:"unknown"}) ,arrayFromPayload:p=>p?.data||[]},
   {read:async()=>({total:null,shapeValid:false,hasNext:false,rows:[]})});
 const unknown=await unexpected.forClient(USER);
 assert.equal(unknown.partnerReport.complete,false);
 assert.equal(unknown.rebateReport.complete,false);
 assert.equal(unknown.accounts[0].partnerMatch,"UNAVAILABLE");
 assert.equal(unknown.accounts[0].rebate.state,"UNAVAILABLE");
 const broken=new Service(db,{...exness,authenticate:async()=>{throw Error("HTTP 401")}},{
  read:async()=>{throw Error("HTTP 429")}
 });
 const unavailable=await broken.forClient(USER);
 assert.equal(unavailable.accounts[0].partnerMatch,"UNAVAILABLE");
 assert.equal(unavailable.accounts[0].rebate.state,"UNAVAILABLE");
 assert.equal(unavailable.partnerReport.complete,false);
 assert.equal(unavailable.rebateReport.complete,false);
 console.log("Exness per-MT5 read-only IB + rebate destination, pagination, masking, incomplete reports PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
