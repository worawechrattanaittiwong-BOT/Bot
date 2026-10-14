const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const text=fs.readFileSync('apps/api/src/brokers/broker-transfer.service.ts','utf8');
const controller=fs.readFileSync('apps/api/src/brokers/broker.controller.ts','utf8');
const page=fs.readFileSync('apps/web/components/ExnessTransferModal.tsx','utf8');
assert(controller.includes('@Post("exness/transfer/:id/check")'));
assert(controller.includes('@UseGuards(JwtGuard)'));
assert(controller.includes('@Get("exness/transfers")'));
assert(page.includes('ยังไม่ได้ส่งไป Exness'));
assert(page.includes('Exness เป็นผู้รับคำขอ'));
assert(page.includes('คัดลอกข้อความ'));
assert(!/api\/partner\/.*transfer/i.test(text));
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true}}).outputText;
class Validation extends Error{};
const ctx={exports:{},Date,RegExp,String,Number,Boolean,
 require:(id)=>id==='@nestjs/common'?{Injectable:()=>x=>x,BadRequestException:Validation,ConflictException:Validation,NotFoundException:Validation}: {},
};
vm.runInNewContext(js,ctx);
const Service=ctx.exports.BrokerTransferService;
const data=[];
const db={
  async query(sql,args){
    if(sql.includes('CREATE TABLE IF NOT EXISTS broker_partner_transfer_requests'))return {rows:[]};
    if(sql.includes('FROM mt5_accounts'))return {rows:[{id:'11111111-1111-4111-8111-111111111111',account_number:'123456789',broker_server:'Exness-MT5Real'}]};
    if(sql.includes('FROM broker_partner_transfer_requests'))return {rows:data};
    if(sql.includes('UPDATE broker_partner_transfer_requests SET last_checked_at'))return {rows:[]};
    throw Error('Unexpected database query');
  },
  async one(sql,args){
    if(sql.includes('SELECT email FROM users'))return {email:'user@example.test'};
    if(sql.includes('INSERT INTO broker_partner_transfer_requests')){
      const row={id:'22222222-2222-4222-8222-222222222222',user_id:args[0],trading_account:args[1],partner_code:args[2],status:'PREPARED',created_at:'2026-10-14T00:00:00Z'};
      data.push(row);return row;
    }
    if(sql.includes('WHERE id=$1 AND user_id=$2')){
      return args[1]==='OWN_USER'? data.find(r=>r.id===args[0])||null:null;
    }
    return null;
  }
};
let exnessCalls=0;
const service=new Service(db,{registrationInfo:async()=>({active:true,partnerCode:'MYCODE'})},{hasPartnerAccount:async n=>{exnessCalls++;return n==='123456789'}});
(async()=>{
  await assert.rejects(()=>service.prepare('OWN_USER',{accountId:'11111111-1111-4111-8111-111111111111',consent:false}),/ยืนยัน/);
  await assert.rejects(()=>service.prepare('OWN_USER',{accountId:'99999999-9999-4999-8999-999999999999',consent:true}),/ไม่ใช่บัญชี/);
  const prepared=await service.prepare('OWN_USER',{accountId:'11111111-1111-4111-8111-111111111111',consent:true});
  assert.equal(prepared.status,'PREPARED');
  assert.equal(prepared.accountNumber,'123456789');
  await assert.rejects(()=>service.checkExness('OTHER_USER',prepared.id),/ไม่พบคำขอ/);
  assert.equal(exnessCalls,0,'cannot inspect other user account');
  const info=await service.customer('OWN_USER');
  assert.equal(info.exnessSubmissionSupported,false);
  assert.equal(info.partnerCode,'MYCODE');
  assert.equal(info.accounts.length,1);
  console.log('Broker Transfer: consent, ownership, prefill and no assumed Exness submission PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
