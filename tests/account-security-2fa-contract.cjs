const assert = require("node:assert/strict");
const { hash } = require("bcryptjs");
require("reflect-metadata");
const { AccountSecurityController } = require("../apps/api/dist/account-security.controller");

(async () => {
  const password = "Correct#123";
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    user_code: "OWNER",
    email: "owner@example.invalid",
    password_hash: await hash(password, 4),
    role: "OWNER",
    status: "ACTIVE",
    created_at: new Date(),
    updated_at: new Date(),
    email_verified_at: new Date()
  };

  let security = null;
  const events = [];
  let securityWrites = 0;

  const db = {
    async one(sql) {
      if (sql.includes("FROM users WHERE id=$1")) return user;
      if (sql.includes("FROM user_security WHERE user_id=$1")) return security;
      throw new Error("unexpected one(): " + sql);
    },
    async query(sql, params = []) {
      if (sql.includes("INSERT INTO user_security")) {
        securityWrites += 1;
        security = {
          totp_secret_ciphertext: params[1],
          totp_secret_iv: params[2],
          totp_secret_auth_tag: params[3],
          two_factor_enabled_at: null
        };
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO auth_events")) {
        events.push(params[2]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error("unexpected query(): " + sql);
    }
  };

  const crypto = {
    encrypt(plain) {
      return { ciphertext: plain, iv: "test-iv", authTag: "test-tag" };
    },
    decrypt(input) {
      return input.ciphertext;
    }
  };

  const controller = new AccountSecurityController(db, {}, crypto);
  const req = { user: { sub: user.id }, headers: {}, ip: "127.0.0.1" };

  const first = await controller.setupTwoFactor(req, { currentPassword: password });
  const second = await controller.setupTwoFactor(req, { currentPassword: password });

  assert.equal(first.resumed, false);
  assert.equal(second.resumed, true);
  assert.equal(second.secret, first.secret, "pending setup must preserve the same TOTP secret");
  assert.equal(second.otpauthUri, first.otpauthUri);
  assert.equal(securityWrites, 1, "retry must not overwrite pending secret");
  assert.deepEqual(events, ["TWO_FACTOR_SETUP_STARTED", "TWO_FACTOR_SETUP_RESUMED"]);

  console.log("PASS: repeated 2FA setup reuses the pending authenticator secret.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
