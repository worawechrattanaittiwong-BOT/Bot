const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const text=fs.readFileSync('apps/api/src/brokers/broker-transfer.service.ts','utf8');
const controller=fs.readFileSync('apps/api/src/brokers/broker.controller.ts','utf8');
const page=fs.readFileSync('apps/web/components/ExnessTransferModal.tsx','utf8');
assert(controller.includes('@Post("exness/transfer/:id/check")'));
assert(controller.includes('@Post("exness/transfer/:id/new-account")'));
assert(controller.includes('@UseGuards(JwtGuard)'));
assert(controller.includes('@Get("exness/transfers")'));
// One-click user flow: SCENOVA records preparation, then customer signs in at Exness.
assert(page.includes('window.location.assign(EXNESS_PERSONAL_AREA)'));
assert(page.includes('api("/brokers/exness/transfer"'));
assert(page.includes('ดำเนินการต่อที่ Exness'));
assert(page.includes('ฉันส่งคำขอที่ Exness แล้ว'));
assert(page.includes('ฉันเป็นเจ้าของบัญชี Exness ที่จะใช้ยื่นคำขอ'));
assert(page.includes('รหัสพาร์ตเนอร์'));
assert(page.includes('aria-label="คัดลอกรหัสพาร์ตเนอร์"'));
assert(page.includes('navigator.clipboard.writeText(partnerCode)'));
assert(page.includes('ขั้นตอนการย้ายพาร์ตเนอร์'));
assert(page.includes('ข้อความส่งให้เจ้าหน้าที่ Exness'));
assert(page.includes('คัดลอกข้อความส่งแชต Exness'));
assert(page.includes('navigator.clipboard.writeText(chatMessage)'));
assert(!page.includes('เลือกบัญชี Exness เดิม'));
assert(!page.includes('accountNumber:selected'));
assert(page.includes('บัญชี Exness (Personal Area)'));
assert(page.includes('"รหัสพาร์ตเนอร์ใหม่: " + info.partnerCode'));
assert(page.includes('"ฉันต้องการขอเปลี่ยนพาร์ตเนอร์ของบัญชี Exness (Personal Area) ไปยัง SCENOVA"'));
assert(page.includes('ใช้ได้ 7 วัน'));
assert(page.includes('3 วันทำการ'));
assert(page.includes('ยืนยันรหัสความปลอดภัย'));

assert(page.includes('{info.partnerCode||"ยังไม่ได้กำหนด"}'));
assert(!page.includes('Dear Exness Support'));
assert(!page.includes('New partner code:'));

assert(page.includes('บัญชีเทรดเดิมจะยังคงอยู่กับพาร์ตเนอร์เดิม'));
assert(page.includes('รับลิงก์เฉพาะบัญชี'));
assert(!page.includes('cp_redirect?token='));
assert(page.includes('คัดลอกข้อความส่งแชต Exness'));
assert(!page.includes('ลิงก์ส่วนตัวที่ Exness'));
assert(text.includes('const found = await this.exness.hasPartnerAccount(String(current.new_trading_account));'));
assert(text.includes('ALTER COLUMN trading_account DROP NOT NULL'));
assert(text.includes('WHERE trading_account IS NULL'));
assert(text.includes('VALUES($1,NULL,$2)'));
assert(!text.includes('hasPartnerAccount(String(current.trading_account))'));
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
    if(sql.includes('FROM mt5_accounts'))return {rows:[
      {id:'11111111-1111-4111-8111-111111111111',account_number:'123456789',broker_server:'Exness-MT5Real',created_at:'2026-10-13T00:00:00Z'},
      {id:'33333333-3333-4333-8333-333333333333',account_number:'999999999',broker_server:'Exness-MT5Real',created_at:'2026-10-15T00:00:00Z'}
    ]};
    if(sql.includes('FROM broker_partner_transfer_requests'))return {rows:data};
    if(sql.includes('UPDATE broker_partner_transfer_requests SET last_checked_at'))return {rows:[]};
    throw Error('Unexpected database query');
  },
  async one(sql,args){
    if(sql.includes('SELECT email FROM users'))return {email:'user@example.test'};
    if(sql.includes('INSERT INTO broker_partner_transfer_requests')){
      const row={id:'22222222-2222-4222-8222-222222222222',user_id:args[0],trading_account:null,partner_code:args[1],status:'PREPARED',created_at:'2026-10-14T00:00:00Z'};
      data.push(row);return row;
    }
    if(sql.includes('UPDATE broker_partner_transfer_requests')&&sql.includes("SET status='CUSTOMER_SUBMITTED'")) {
      const row=data.find(r=>r.id===args[0]);row.status='CUSTOMER_SUBMITTED';row.customer_submitted_at='2026-10-14T00:00:00Z';return row;
    }
    if(sql.includes('UPDATE broker_partner_transfer_requests')&&sql.includes('SET new_trading_account')) {
      const row=data.find(r=>r.id===args[0]);
      row.new_trading_account=args[2];row.status='CUSTOMER_SUBMITTED';
      return row;
    }
    if(sql.includes('UPDATE broker_partner_transfer_requests')&&sql.includes("status='PARTNER_VISIBLE'")) {
      const row=data.find(r=>r.id===args[0]);row.status='PARTNER_VISIBLE';return row;
    }
    if(sql.includes('WHERE id=$1 AND user_id=$2')){
      return args[1]==='OWN_USER'? data.find(r=>r.id===args[0])||null:null;
    }
    return null;
  }
};
let exnessCalls=0;
const service=new Service(db,{registrationInfo:async()=>({active:true,partnerCode:'MYCODE'})},{hasPartnerAccount:async n=>{exnessCalls++;return n==='999999999'}});
(async()=>{
  await assert.rejects(()=>service.prepare('OWN_USER',{consent:false}),/ยืนยัน/);
  const prepared=await service.prepare('OWN_USER',{consent:true});
  assert.equal(prepared.status,'PREPARED');
  assert.equal(prepared.accountNumber,null);
  assert.equal(prepared.accountLast4,null);
  await assert.rejects(()=>service.checkExness('OTHER_USER',prepared.id),/ไม่พบคำขอ/);
  assert.equal(exnessCalls,0,'cannot inspect other user account');
  await assert.rejects(()=>service.checkExness('OWN_USER',prepared.id),/บัญชีเทรดใหม่/);
  await assert.rejects(()=>service.setNewAccount('OWN_USER',prepared.id,'11111111-1111-4111-8111-111111111111',true),/คำขอกับ Exness/);
  await assert.rejects(()=>service.setNewAccount('OTHER_USER',prepared.id,'33333333-3333-4333-8333-333333333333',true),/ไม่พบคำขอ/);
  const submitted=await service.markSubmitted('OWN_USER',prepared.id);
  assert.equal(submitted.status,'CUSTOMER_SUBMITTED');
  await assert.rejects(()=>service.setNewAccount('OWN_USER',prepared.id,'33333333-3333-4333-8333-333333333333',false),/ยืนยัน/);
  await assert.rejects(()=>service.setNewAccount('OWN_USER',prepared.id,'11111111-1111-4111-8111-111111111111',true),/ก่อนส่งคำขอ/);
  const newLinked=await service.setNewAccount('OWN_USER',prepared.id,'33333333-3333-4333-8333-333333333333',true);
  assert.equal(newLinked.newAccountNumber,'999999999');
  const verified=await service.checkExness('OWN_USER',prepared.id);
  assert.equal(verified.matched,true);
  assert.equal(exnessCalls,1,'only linked new account can be inspected');
  const info=await service.customer('OWN_USER');
  assert.equal(info.exnessSubmissionSupported,false);
  assert.equal(info.partnerCode,'MYCODE');
  assert.equal(info.accounts.length,2);
  console.log('Broker Transfer: PA-level requests, consent, ownership, new account and Exness verification PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
