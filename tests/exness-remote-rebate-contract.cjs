const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('apps/api/src/brokers/exness-rebate.service.ts','utf8');
const exnessSrc=fs.readFileSync('apps/api/src/brokers/exness-partnership-api.service.ts','utf8');
const auto=fs.readFileSync('apps/api/src/brokers/broker-automation.service.ts','utf8');
const app=fs.readFileSync('apps/api/src/app.module.ts','utf8');
const ui=fs.readFileSync('apps/web/app/broker/page.tsx','utf8');
assert(!app.includes('AdminBrokerFinanceController'),'legacy payout routes not registered');
assert(!app.includes('BrokerFinanceService'),'legacy payout provider not registered');
assert(!auto.includes('this.finance.recordCommission('));
assert(!auto.includes('this.finance.releaseRebate('));
assert(ui.includes('<ExnessRebateControl/>'));
assert(!ui.includes('/admin/brokers/exness/finance/rebates/'));
assert(exnessSrc.includes('async mutateRebate('));
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}}).outputText;
class Invalid extends Error{}
const scope={exports:{},Date,Math,Number,Boolean,String,JSON,URLSearchParams,Set,Object,
 require:(name)=>name==='@nestjs/common'?{Injectable:()=>a=>a,BadRequestException:Invalid,ConflictException:Invalid}: {}
};
vm.runInNewContext(code,scope);
const Service=scope.exports.ExnessRebateService;
let mutateCalls=[];
const exness={
 authenticate:async()=>"FAKE_TOKEN",
 request:async(path)=>({data:[{client_account:'12345678',rebate_percent:30,private_email:'PRIVATE_VALUE',destination_client_account:'12345678'}]}),
 arrayFromPayload:(value)=>value.data,
 mutateRebate:async(method,path,body)=>{mutateCalls.push({method,path,body});return {verification_payload:{operation_type:'approving',requested_at:'2026-10-14T00:00:00Z'}};}
};
let claimCount=0;
const db={
  query:async()=>({rows:[]}),
  one:async(sql,args)=>{
    if(sql.includes('INSERT INTO exness_rebate_approval_attempts'))return {id:'00000000-0000-4000-8000-000000000001'};
    if(sql.includes("status='PROCESSING'"))return ++claimCount===1?{id:args[0]}:null;
    return null;
  }
};
(async()=>{
 const svc=new Service(db,exness);
 const report=await svc.read('clients');
 assert.equal(report.source,'EXNESS_PARTNERS');
 assert.equal(report.count,1);
 assert.equal(report.rows[0].rebate_percent,30);
 assert(!JSON.stringify(report).includes('PRIVATE_VALUE'));
 await assert.rejects(()=>svc.read('payments',300),/แบ่งหน้า/);
 await assert.rejects(()=>svc.setClient({clientAccount:'bad',destinationClientAccount:'12345678',percent:30},'ADMIN'),/เลขบัญชี/);
 await assert.rejects(()=>svc.setClient({clientAccount:'12345678',destinationClientAccount:'12345678',percent:130},'ADMIN'),/เปอร์เซ็นต์/);
 assert.equal(mutateCalls.length,0,'invalid updates must never call Exness');
 await svc.setClient({clientAccount:'12345678',destinationClientAccount:'12345678',percent:30},'ADMIN');
 assert.equal(mutateCalls[0].method,'PATCH');
 assert.equal(mutateCalls[0].body.rebate_percent,30);
 await assert.rejects(()=>svc.start({rebates:['bad']},'ADMIN'),/เลือก Rebate ID/);
 assert.equal(mutateCalls.length,1);
 const approval=await svc.start({rebates:['12345']},'ADMIN');
 assert.equal(approval.verificationRequired,true);
 assert(!JSON.stringify(approval).includes('FAKE_TOKEN'));
 await svc.complete({attemptId:approval.attemptId,verificationToken:'SAMPLE_TEST_TOKEN'},'ADMIN');
 await assert.rejects(()=>svc.complete({attemptId:approval.attemptId,verificationToken:'SAMPLE_TEST_TOKEN'},'ADMIN'),/ห้ามส่งซ้ำ/);
 assert.equal(mutateCalls.filter(x=>x.path.includes('approve/complete')).length,1);
 console.log('Exness rebate: read-only reports, strict inputs, confirmation flow, no local wallet and double-complete prevention PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
