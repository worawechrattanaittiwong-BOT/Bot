import pg from "pg";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgresql://bot:bot@localhost:5432/bot"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectDbError(work, message) {
  let failed = false;
  try {
    await work();
  } catch {
    failed = true;
  }
  assert(failed, message);
}

async function balances(userId) {
  const result = await client.query(
    `SELECT
       COALESCE((SELECT SUM(available_delta_satang) FROM commission_wallet_ledger WHERE beneficiary_user_id=$1),0)::bigint +
       COALESCE((SELECT SUM(available_delta_satang) FROM commission_withdrawal_ledger WHERE user_id=$1),0)::bigint AS available,
       COALESCE((SELECT SUM(locked_delta_satang) FROM commission_withdrawal_ledger WHERE user_id=$1),0)::bigint AS locked,
       COALESCE((SELECT SUM(paid_delta_satang) FROM commission_withdrawal_ledger WHERE user_id=$1),0)::bigint AS paid,
       COALESCE((SELECT SUM(available_delta_satang+locked_delta_satang+paid_delta_satang)
                 FROM commission_withdrawal_ledger WHERE user_id=$1),0)::bigint AS conserved`,
    [userId]
  );
  const row = result.rows[0];
  return {
    available: Number(row.available),
    locked: Number(row.locked),
    paid: Number(row.paid),
    conserved: Number(row.conserved)
  };
}

await client.connect();
try {
  const suffix = Date.now().toString(36);
  const beneficiary = (await client.query(
    `INSERT INTO users(user_code,email,password_hash,role,status)
     VALUES($1,$2,'ci','USER','ACTIVE') RETURNING id`,
    ["BOT-WD-" + suffix, "wd-" + suffix + "@scenova.test"]
  )).rows[0].id;

  const source = (await client.query(
    `INSERT INTO users(user_code,email,password_hash,role,status)
     VALUES($1,$2,'ci','USER','ACTIVE') RETURNING id`,
    ["BOT-SRC-" + suffix, "src-" + suffix + "@scenova.test"]
  )).rows[0].id;

  const commission = (await client.query(
    `INSERT INTO referral_commissions(
       beneficiary_user_id,source_user_id,source_type,source_id,
       level,rate_bps,gross_amount_satang,commission_amount_satang,
       currency,status,available_at,metadata
     ) VALUES($1,$2,'CI_WITHDRAWAL',gen_random_uuid(),1,700,1000000,70000,'THB','AVAILABLE',now(),'{}'::jsonb)
     RETURNING *`,
    [beneficiary, source]
  )).rows[0];

  await client.query(
    `INSERT INTO commission_wallet_ledger(
       entry_key,beneficiary_user_id,commission_id,event_type,
       pending_delta_satang,available_delta_satang,paid_delta_satang,
       currency,source_type,source_id,level,rate_bps,metadata
     ) VALUES($1,$2,$3,'MIGRATION_SNAPSHOT',0,70000,0,'THB',$4,$5,1,700,'{}'::jsonb)`,
    ["ci-wallet:" + commission.id, beneficiary, commission.id, commission.source_type, commission.source_id]
  );

  const destination = (await client.query(
    `INSERT INTO commission_payout_destinations(
       user_id,bank_code,bank_name,account_name,
       account_ciphertext,account_iv,account_auth_tag,account_last4,account_hash,status,usable_at
     ) VALUES($1,'CI','CI Bank','CI Beneficiary','cipher','iv','tag','7890',$2,'ACTIVE',now())
     RETURNING id`,
    [beneficiary, "a".repeat(64)]
  )).rows[0].id;

  const makeWithdrawal = async (amount, key) => (await client.query(
    `INSERT INTO commission_withdrawals(
       user_id,destination_id,amount_satang,currency,status,client_request_key
     ) VALUES($1,$2,$3,'THB','REQUESTED',$4)
     RETURNING id`,
    [beneficiary, destination, amount, key]
  )).rows[0].id;

  const lock = async (id, amount) => client.query(
    `INSERT INTO commission_withdrawal_ledger(
       entry_key,user_id,withdrawal_id,event_type,
       available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
     ) VALUES($1,$2,$3,'LOCK',$4,$5,0,'THB','{}'::jsonb)`,
    ["lock:" + id, beneficiary, id, -amount, amount]
  );

  const first = await makeWithdrawal(30000, "ci-lock-1-" + suffix);
  await lock(first, 30000);

  let state = await balances(beneficiary);
  assert(state.available === 40000, "lock must reduce available to 40000");
  assert(state.locked === 30000, "lock must move 30000 to locked");
  assert(state.conserved === 0, "withdrawal ledger must conserve value");

  await expectDbError(
    () => makeWithdrawal(10000, "ci-second-open-" + suffix),
    "database must reject a second open withdrawal"
  );
  await expectDbError(
    () => client.query("UPDATE commission_withdrawals SET amount_satang=999999 WHERE id=$1", [first]),
    "withdrawal amount must be immutable"
  );

  await client.query(
    "UPDATE commission_withdrawals SET status='CANCELLED',updated_at=now() WHERE id=$1",
    [first]
  );
  await client.query(
    `INSERT INTO commission_withdrawal_ledger(
       entry_key,user_id,withdrawal_id,event_type,
       available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
     ) VALUES($1,$2,$3,'UNLOCK',30000,-30000,0,'THB','{}'::jsonb)`,
    ["cancel:" + first, beneficiary, first]
  );

  state = await balances(beneficiary);
  assert(state.available === 70000 && state.locked === 0, "cancel must fully unlock balance");

  const paid = await makeWithdrawal(20000, "ci-paid-" + suffix);
  await lock(paid, 20000);
  await client.query("UPDATE commission_withdrawals SET status='HOLD',updated_at=now() WHERE id=$1", [paid]);
  await client.query("UPDATE commission_withdrawals SET status='APPROVED',approved_at=now(),updated_at=now() WHERE id=$1", [paid]);
  await client.query("UPDATE commission_withdrawals SET status='PAID',paid_at=now(),payout_reference='CI-REF',updated_at=now() WHERE id=$1", [paid]);
  await client.query(
    `INSERT INTO commission_withdrawal_ledger(
       entry_key,user_id,withdrawal_id,event_type,
       available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
     ) VALUES($1,$2,$3,'PAID',0,-20000,20000,'THB','{}'::jsonb)`,
    ["paid:" + paid, beneficiary, paid]
  );

  state = await balances(beneficiary);
  assert(state.available === 50000, "paid withdrawal must keep 50000 available");
  assert(state.locked === 0, "paid withdrawal must clear locked");
  assert(state.paid === 20000, "paid withdrawal must record 20000 paid");
  assert(state.conserved === 0, "paid flow must conserve value");

  await expectDbError(
    () => client.query("UPDATE commission_withdrawals SET status='REQUESTED' WHERE id=$1", [paid]),
    "terminal PAID status must not move backwards"
  );

  const rejected = await makeWithdrawal(10000, "ci-reject-" + suffix);
  await lock(rejected, 10000);
  await client.query("UPDATE commission_withdrawals SET status='REJECTED',rejected_at=now(),updated_at=now() WHERE id=$1", [rejected]);
  await client.query(
    `INSERT INTO commission_withdrawal_ledger(
       entry_key,user_id,withdrawal_id,event_type,
       available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
     ) VALUES($1,$2,$3,'UNLOCK',10000,-10000,0,'THB','{}'::jsonb)`,
    ["reject:" + rejected, beneficiary, rejected]
  );

  state = await balances(beneficiary);
  assert(state.available === 50000 && state.locked === 0 && state.paid === 20000,
    "reject must restore available without changing paid");
  assert(state.conserved === 0, "reject flow must conserve value");

  const audit = (await client.query(
    `INSERT INTO commission_withdrawal_audit(
       user_id,withdrawal_id,destination_id,actor_type,event_type,metadata
     ) VALUES($1,$2,$3,'SYSTEM','CI_AUDIT','{}'::jsonb)
     RETURNING id`,
    [beneficiary, rejected, destination]
  )).rows[0].id;

  await expectDbError(
    () => client.query("UPDATE commission_withdrawal_audit SET event_type='MUTATED' WHERE id=$1", [audit]),
    "audit rows must be immutable"
  );
  await expectDbError(
    () => client.query("UPDATE commission_payout_destinations SET account_last4='0000' WHERE id=$1", [destination]),
    "destination identity must be immutable"
  );

  console.log("Commission withdrawal DB integration: PASS");
} finally {
  await client.end();
}
