const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('apps/api/src/brokers/exness-partnership-api.service.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}}).outputText;
let reject=true;
const requests=[];
const context={exports:{},AbortSignal,JSON,String,Date,URLSearchParams,
  process:{env:{}},
  require:(key)=>{
    if(key==='@nestjs/common')return {Injectable:()=>x=>x,ConflictException:class extends Error{},BadRequestException:class extends Error{}};
    if(key==='../db.service'||key==='../runtime-secrets.service')return {};
    throw Error('unexpected import '+key);
  },
  fetch:async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('/api/v2/auth/'))return reject
      ? {ok:false,status:401,text:async()=>JSON.stringify({code:'AuthenticationFailed',secret:'DO_NOT_LEAK'})}
      : {ok:true,status:200,text:async()=>JSON.stringify({token:'TEST_ONLY_TOKEN'})};
    if(url.endsWith('/api/partner/default_link/'))return {ok:true,status:200,text:async()=>JSON.stringify({link:'ok'})};
    throw Error('Unexpected url');
  }
};
vm.runInNewContext(compiled,context);
const Service=context.exports.ExnessPartnershipApiService;
const writes=[];
const secrets={save:async payload=>{writes.push({type:'vault',key:payload.configKey})}};
const db={query:async(sql)=>{writes.push({type:'sql',text:sql});return {rows:[]}},one:async()=>({})};
(async()=>{
  const service=new Service(db,secrets);
  const failed=await service.connect({email:'fake@example.test',password:'wrong-password'},'ADMIN:TEST');
  assert.equal(failed.ok,false);
  assert.equal(failed.saved,false);
  assert.equal(writes.filter(x=>x.type==='vault').length,0,'no changes to credentials after failed auth');
  assert(!JSON.stringify(failed).includes('DO_NOT_LEAK'));
  assert(!JSON.stringify(failed).includes('wrong-password'));
  reject=false;
  const success=await service.connect({email:'fake@example.test',password:'correct-password'},'ADMIN:TEST');
  assert.equal(success.ok,true);
  assert.equal(success.saved,true);
  assert.deepEqual(writes.filter(x=>x.type==='vault').map(x=>x.key),['EXNESS_PARTNER_EMAIL','EXNESS_PARTNER_PASSWORD']);
  const sql=writes.filter(x=>x.type==='sql').map(x=>x.text).join('\n');
  assert(sql.includes('enabled=false,next_sync_at=NULL'));
  assert(sql.includes("last_test_status='PASS'"));
  assert.equal(requests.filter(x=>x.url.endsWith('/api/v2/auth/')).length,2);
  console.log('Safe Exness connect: rejects wrong credentials without save, then saves verified pair with sync disabled');
})().catch(err=>{console.error(err);process.exitCode=1});
