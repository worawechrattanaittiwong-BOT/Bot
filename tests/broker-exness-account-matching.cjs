const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('apps/api/src/brokers/broker-automation.service.ts','utf8');
const api=fs.readFileSync('apps/api/src/brokers/exness-partnership-api.service.ts','utf8');
const controller=fs.readFileSync('apps/api/src/brokers/broker-automation.controller.ts','utf8');
const ui=fs.readFileSync('apps/web/app/broker/page.tsx','utf8');
assert(api.includes("client_report_path='/api/reports/clients/accounts/'"));
assert(api.includes("client_report_path='/api/v3/reports/clients/shared/'"));
assert(source.includes('"client_account","clientAccount"'));
assert(controller.includes('@Get("client-match-preview")'));
assert(controller.includes('@UseGuards(AdminGuard)'));
assert(ui.includes('client-match-preview'));
assert(ui.includes('setInterval(() => {'));
assert(ui.indexOf('dashboardCaption')<ui.indexOf('<form className={styles.card} onSubmit={save}>'));
assert(ui.indexOf('settingsCaption')<ui.indexOf('CLIENT MATCHING'));
const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}}).outputText;
const ctx={exports:{},require:(id)=>{
 if(id==='@nestjs/common')return {Injectable:()=>a=>a};
 if(id==='crypto')return {randomUUID:()=> 'fake-uuid'};
 if(id.startsWith('./')||id.startsWith('../'))return {};
 throw Error('Unexpected import '+id)
},console,process,Date,setInterval,clearInterval};
vm.runInNewContext(transpiled,ctx);
const Service=ctx.exports.BrokerAutomationService;
const db={
 async one(query,args){
  assert.match(query,/FROM mt5_accounts/);
  assert.equal(args.length,1);
  return args[0]==='12345345'?{id:'SCENOVA-TEST-USER'}:null;
 },
 async query(){throw Error('Read-only preview must never write')}
};
const fakeApi={
 async state(){return {clientReportPath:'/api/reports/clients/accounts/'}},
 async authenticate(){return 'MOCK_ONLY'},
 async request(path,token){
  assert.equal(path,'/api/reports/clients/accounts/');
  assert.equal(token,'MOCK_ONLY');
  return {data:[{client_account:'12345345',client_uid:'fake-ref'},{client_account:'99110547'},{client_uid:'no-account'}]};
 },
 arrayFromPayload:x=>x.data
};
(async()=>{
 const service=new Service(db,fakeApi,{},{}), result=await service.previewClientMatches();
 assert.equal(result.reportCount,3);
 assert.equal(result.usableAccountRows,2);
 assert.equal(result.matched.length,1);
 assert.equal(result.matched[0].userId,'SCENOVA-TEST-USER');
 assert.deepEqual([...result.matched[0].accountLast4],['5345']);
 assert(!JSON.stringify(result).includes('12345345'));
 console.log('Exness account report client_account matching read-only contract: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
