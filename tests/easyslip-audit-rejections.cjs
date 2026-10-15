const test=require('node:test');
const assert=require('node:assert/strict');
const {ConflictException}=require('@nestjs/common');
const {EasySlipPaymentService}=require('../apps/api/dist/easyslip-payment.service.js');
const orderId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const rejection='บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชีที่ลงทะเบียนไว้ใน EasySlip ของ SCENOVA';
const maskedDetails=['base64','trans_ref','bankNumber','sender','receiver','amountBaht','secret'];

function setup(orderType,raise){
 const calls=[];
 const db={
   async one(sql,args){
     calls.push({kind:'one',sql,args});
     assert.equal(args[0],orderId);
     assert.equal(args[1],userId);
     assert(sql.includes(orderType==='LOCAL'?'local_orders':'cloud_orders'));
     return {id:orderId,user_id:userId,status:'PENDING',amount:30201,created_at:new Date('2026-10-14T10:06:44Z'),payment_provider:'EASYSLIP'};
   },
   async query(sql,args){calls.push({kind:'query',sql,args});return {rows:[]};},
 };
 const service=new EasySlipPaymentService(db,{}, {});
 service.verifySlip=async()=>{throw raise;};
 return {service,calls};
}
for (const orderType of ['CLOUD','LOCAL']){
 test(orderType+' failed recipient matching is reported without granting slot or exposing payment secrets',async()=>{
   const {service,calls}=setup(orderType,new ConflictException(rejection));
   await assert.rejects(service.verifyAndActivate({base64:'SECRET_BASE64_DATA',orderType,orderId,userId}),
       (err)=>err.getStatus()===409 && err.message.includes('บัญชีผู้รับเงิน'));
   const writes=calls.filter(c=>c.kind==='query');
   assert.equal(writes.length,1);
   assert(writes[0].sql.includes('SLIP_VERIFICATION_REJECTED'));
   assert(writes[0].sql.includes('audit_logs'));
   assert.deepEqual(JSON.parse(writes[0].args[1]),{
      orderType,provider:'EASYSLIP',stage:'PROVIDER',reason:'RECEIVER_UNMATCHED'
   });
   for(const item of maskedDetails)assert(!writes[0].args[1].includes(item),'sensitive field '+item);
   assert(!calls.some(c=>c.sql.includes('INSERT INTO license_slots')||c.sql.includes('INSERT INTO subscriptions')));
 });
}
test('rejected-provider audit failure does not allow payment to become PAID',async()=>{
 const {service}=setup('CLOUD',new ConflictException('Provider unavailable'));
 service.db.query=async()=>{throw new Error('audit database temporarily unavailable');};
 await assert.rejects(service.verifyAndActivate({base64:'DATA',orderType:'CLOUD',orderId,userId}),
   (err)=>err.getStatus()===409 && err.message==='Provider unavailable');
});
test('slip time too old logs explicit SLIP_BEFORE_ORDER',async()=>{
 const {service,calls}=setup('CLOUD',null);
 service.verifySlip=async()=>({
   transRef:'not stored in audit',slipDate:'2026-10-14T09:00:00Z',amountBaht:302.01,
   isDuplicate:false,matchedAccount:{},sender:{name:'PRIVATE'},receiver:{name:'PRIVATE'}
 });
 await assert.rejects(service.verifyAndActivate({base64:'PRIVATE_IMAGE',orderType:'CLOUD',orderId,userId}),e=>e.getStatus()===409);
 const audit=calls.find(c=>c.kind==='query');
 assert.equal(JSON.parse(audit.args[1]).reason,'SLIP_BEFORE_ORDER');
 assert(!audit.args[1].includes('PRIVATE'));
});
