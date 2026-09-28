// Run after the API build: node tests/cloud-commerce.cjs
// Real PostgreSQL semantics in memory; no merchant, broker or production calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../apps/api/node_modules/@electric-sql/pglite');
require('../apps/api/node_modules/reflect-metadata');
const { CloudService, CloudCustomerController, CloudAdminController } = require('../apps/api/dist/cloud.controller');
const { CryptoService, WorkerGuard } = require('../apps/api/dist/security');
const { WorkerController } = require('../apps/api/dist/worker.controller');
const { CLOUD_SCHEMA } = require('../apps/api/dist/cloud-schema');

(async () => {
  process.env.OMISE_SECRET_KEY='skey_test_in_memory_only';
  process.env.CLOUD_CHECKOUT_ENABLED='true';
  process.env.CREDENTIAL_MASTER_KEY=Buffer.alloc(32,1).toString('base64');
  const pg = new PGlite();
  const base = fs.readFileSync(path.join(__dirname,'../database/001_init.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
  await pg.exec(base);
  await pg.exec(`CREATE TABLE license_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_user_id uuid REFERENCES users(id),assigned_user_id uuid REFERENCES users(id),
    subscription_id uuid REFERENCES subscriptions(id),mode text,slot_number int,slot_type text,status text,label text,updated_at timestamptz DEFAULT now());
    ALTER TABLE bot_instances ADD COLUMN slot_id uuid REFERENCES license_slots(id);`);
  await pg.exec(fs.readFileSync(path.join(__dirname,'../database/002_cloud_worker.sql'),'utf8'));
  await pg.exec(`CREATE TABLE IF NOT EXISTS access_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,enabled boolean NOT NULL DEFAULT true);
    CREATE TABLE IF NOT EXISTS access_group_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),access_group_id uuid REFERENCES access_groups(id),user_id uuid REFERENCES users(id),
    mode text NOT NULL,starts_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'ACTIVE');`);
  await pg.exec(CLOUD_SCHEMA);
  await pg.exec(CLOUD_SCHEMA); // startup migration can run again without resetting prices or nodes
  const adapt = db => ({query:async (sql,params=[])=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows};},
    one:async (sql,params=[])=> (await db.query(sql,params)).rows[0]||null});
  const db={...adapt(pg),transaction:work=>pg.transaction(tx=>work(adapt(tx)))};
  const crypto = new CryptoService();
  const cloud = new CloudService(db);
  const customer = new CloudCustomerController(db,cloud);
  const admin = new CloudAdminController(db,cloud,crypto);
  const worker = new WorkerController(db,crypto);
  const charges = new Map();
  let calls=0;
  cloud.gateway=async (route,fields)=>{
    if(!fields)return charges.get(route.split('/').pop());
    calls++;
    const charge={object:'charge',id:'chrg_test_'+calls,metadata:{order_id:fields.get('metadata[order_id]')},
      amount:Number(fields.get('amount')),currency:fields.get('currency'),livemode:false,paid:false,status:'pending',
      expires_at:fields.get('expires_at'),source:{scannable_code:{image:{download_uri:'https://example.invalid/qr.svg'}}}};
    charges.set(charge.id,charge);return charge;
  };
  const user1=await db.one("INSERT INTO users(user_code,email,password_hash) VALUES('TEST1','one@example.invalid','not-used') RETURNING id");
  const user2=await db.one("INSERT INTO users(user_code,email,password_hash) VALUES('TEST2','two@example.invalid','not-used') RETURNING id");
  const req1={user:{sub:user1.id}},req2={user:{sub:user2.id}};
  const node=await admin.addNode({runnerId:'test-node',region:'test',capacity:1,monthlyCost:4000,spec:'fixture'});
  await admin.packages({months:1,priceSatang:100000,enabled:true});
  await assert.rejects(()=>customer.checkout(req1,{months:1}),/VPS/);
  assert.equal(calls,0,'offline checkout never calls provider');
  const guard=new WorkerGuard(db);
  const context=key=>({switchToHttp:()=>({getRequest:()=>({body:{runnerId:'test-node'},headers:{'x-worker-key':key}})})});
  await assert.rejects(()=>guard.canActivate(context('wrong')));
  assert.equal(await guard.canActivate(context(node.workerKey)),true);
  await worker.heartbeat({runnerId:'test-node',activeInstances:0,telemetry:{templateReady:true,cpuPercent:5}});
  await admin.updateNode('test-node',{capacity:1,acceptingJobs:true});
  const checkout=await customer.checkout(req1,{months:1});
  assert.equal((await cloud.catalog()).available,0,'pending QR reserves last seat');
  await assert.rejects(()=>customer.checkout(req2,{months:1}),/Cloud/);
  await assert.rejects(()=>customer.checkout(req1,{months:1}),/รายการ/);
  assert.equal(calls,1);
  const charge=charges.get('chrg_test_1');
  charge.status='successful';charge.paid=true;charge.amount=1;
  await assert.rejects(()=>cloud.reconcile(charge.id),/ไม่ตรง/);
  assert.equal((await db.one('SELECT count(*)::int n FROM subscriptions')).n,0);
  charge.amount=100000;charge.livemode=true;
  await assert.rejects(()=>cloud.reconcile(charge.id),/ไม่ตรง/);
  charge.livemode=false;
  await cloud.reconcile(charge.id);
  await cloud.reconcile(charge.id);
  assert.equal((await db.one('SELECT count(*)::int n FROM subscriptions')).n,1,'duplicate webhook does not create a second subscription');
  const order=await db.one('SELECT * FROM cloud_orders WHERE id=$1',[checkout.id]);
  assert.equal(order.status,'PAID');assert.ok(order.slot_id);
  assert.equal((await db.one('SELECT occupied FROM cloud_node_load')).occupied,1);
  const account=await db.one("INSERT INTO mt5_accounts(user_id,account_number,broker_server,mode) VALUES($1,'123','Demo','CLOUD') RETURNING id",[user1.id]);
  const token=crypto.encrypt('test-install-token'),password=crypto.encrypt('test-password');
  const bot=await db.one("INSERT INTO bot_instances(slot_id,mt5_account_id,mode,install_token_hash) VALUES($1,$2,'CLOUD','hash') RETURNING id",[order.slot_id,account.id]);
  await db.query('INSERT INTO bot_settings(bot_instance_id) VALUES($1)',[bot.id]);
  await db.query('INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4)',[account.id,password.ciphertext,password.iv,password.authTag]);
  await db.query('INSERT INTO bot_instance_secrets(bot_instance_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4)',[bot.id,token.ciphertext,token.iv,token.authTag]);
  await admin.updateNode('test-node',{capacity:1,acceptingJobs:false});
  const job=await worker.claimNext({runnerId:'test-node'});
  assert.equal(job.job.instanceId,bot.id,'paid reservation is fulfilled even when new sales paused');
  assert.equal(job.job.tradingPassword,'test-password');
  assert.equal((await worker.claimNext({runnerId:'test-node'})).job,null,'no duplicate claim');
  assert.equal((await db.one('SELECT occupied FROM cloud_node_load')).occupied,1,'paid seat and assigned MT5 are not double counted');
  assert.equal((await db.one('SELECT desired_state FROM bot_instances WHERE id=$1',[bot.id])).desired_state,'STOPPED','purchase does not start trading');
  const before=await db.one('SELECT expires_at FROM subscriptions WHERE id=$1',[order.subscription_id]);
  await customer.checkout(req1,{months:1,slotId:order.slot_id});
  const renewal=charges.get('chrg_test_2');renewal.status='successful';renewal.paid=true;
  await cloud.reconcile(renewal.id);
  const renewed=await db.one('SELECT s.expires_at FROM license_slots l JOIN subscriptions s ON s.id=l.subscription_id WHERE l.id=$1',[order.slot_id]);
  assert.ok(new Date(renewed.expires_at)>new Date(before.expires_at),'renewal preserves unused time');
  assert.equal((await db.one('SELECT occupied FROM cloud_node_load')).occupied,1);
  await admin.updateNode('test-node',{capacity:2,acceptingJobs:true});
  await customer.checkout(req2,{months:1});
  const failed=charges.get('chrg_test_3');failed.status='expired';
  await cloud.reconcile(failed.id);
  assert.equal((await cloud.catalog()).available,1,'provider expiry releases reservation');

  // Membership expiry is a hard VPS access cutoff. It must queue an exact
  // STOP_INSTANCE even when the EA still reports open positions/pending orders.
  const currentSubscription=await db.one('SELECT subscription_id FROM license_slots WHERE id=$1',[order.slot_id]);
  await db.query("UPDATE subscriptions SET expires_at=now()-interval '1 second' WHERE id=$1",[currentSubscription.subscription_id]);
  await db.query(
    "UPDATE bot_instances SET desired_state='RUNNING',actual_state='RUNNING',runtime_stop_state='NONE',metrics=jsonb_build_object('positions',3,'accountScenovaPendingOrders',1) WHERE id=$1",
    [bot.id]
  );
  const expiryCommand=await worker.commands({runnerId:'test-node'});
  assert.equal(expiryCommand.command.name,'STOP_INSTANCE','expired Cloud membership queues a hard MT5 stop even with open positions');
  const cutoffState=await db.one('SELECT desired_state,runtime_stop_state FROM bot_instances WHERE id=$1',[bot.id]);
  assert.equal(cutoffState.desired_state,'STOPPED','membership cutoff revokes RUNNING intent immediately');
  assert.equal(cutoffState.runtime_stop_state,'STOP_REQUESTED','membership cutoff waits for verified Worker process stop');

  console.log('PASS: migrations, per-node auth, offline/full checkout, reservations, payment validation, duplicate webhook, renewal, worker assignment, expiry hard cutoff.');
  await pg.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
