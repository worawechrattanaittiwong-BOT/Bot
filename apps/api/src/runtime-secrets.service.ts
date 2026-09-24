import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService } from "./security";

const BLOCKED_KEYS = new Set([
  "DATABASE_URL",
  "JWT_SECRET",
  "ADMIN_KEY",
  "WORKER_KEY",
  "CREDENTIAL_MASTER_KEY",
  "NODE_ENV",
  "PORT"
]);

@Injectable()
export class RuntimeSecretsService implements OnApplicationBootstrap {
  private readonly managedKeys = new Set<string>();
  private readonly originalEnv = new Map<string, string | undefined>();
  private tableReady = false;

  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  async onApplicationBootstrap() {
    await this.ensureTable();
    await this.reload();
  }

  async ensureTable() {
    if (this.tableReady) return;
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS admin_api_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key varchar(96) NOT NULL UNIQUE,
        category varchar(32) NOT NULL DEFAULT 'OTHER',
        label varchar(140) NOT NULL,
        ciphertext text NOT NULL,
        iv text NOT NULL,
        auth_tag text NOT NULL,
        last_four varchar(8) NOT NULL DEFAULT '',
        note text NOT NULL DEFAULT '',
        active boolean NOT NULL DEFAULT true,
        updated_by varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_api_credentials_category
        ON admin_api_credentials(category,updated_at DESC);
    `);
    this.tableReady = true;
  }

  normalizeKey(value: unknown) {
    const key = String(value || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{2,95}$/.test(key)) {
      throw new Error("invalid config key");
    }
    if (BLOCKED_KEYS.has(key)) {
      throw new Error("protected system key");
    }
    return key;
  }

  normalizeCategory(value: unknown) {
    const category = String(value || "OTHER").trim().toUpperCase();
    return ["EMAIL","SMS","PAYMENT","AI","NEWS","MARKET_DATA","OTHER"].includes(category)
      ? category
      : "OTHER";
  }

  async reload() {
    await this.ensureTable();

    for (const key of this.managedKeys) {
      const original = this.originalEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    this.managedKeys.clear();

    const result = await this.db.query(
      `SELECT config_key,ciphertext,iv,auth_tag
       FROM admin_api_credentials
       WHERE active=true`
    );

    for (const row of result.rows) {
      const key = String(row.config_key || "").trim().toUpperCase();
      if (!key || BLOCKED_KEYS.has(key)) continue;
      try {
        const value = this.crypto.decrypt({
          ciphertext: String(row.ciphertext),
          iv: String(row.iv),
          authTag: String(row.auth_tag)
        });
        if (!this.originalEnv.has(key)) this.originalEnv.set(key, process.env[key]);
        process.env[key] = value;
        this.managedKeys.add(key);
      } catch {
        // A damaged or old ciphertext must never overwrite the environment fallback.
      }
    }
  }

  async list() {
    await this.ensureTable();
    const result = await this.db.query(
      `SELECT id,config_key,category,label,last_four,note,active,updated_by,created_at,updated_at
       FROM admin_api_credentials
       ORDER BY category,label,config_key`
    );
    return result.rows.map(row => ({
      ...row,
      masked_value: row.last_four ? "••••••••" + row.last_four : "••••••••",
      source: "VAULT"
    }));
  }

  async save(input: {
    id?: string;
    configKey: string;
    category: string;
    label: string;
    value?: string;
    note?: string;
    active?: boolean;
    updatedBy?: string;
  }) {
    await this.ensureTable();
    const configKey = this.normalizeKey(input.configKey);
    const category = this.normalizeCategory(input.category);
    const label = String(input.label || "").trim();
    const note = String(input.note || "").trim();
    const active = input.active !== false;
    if (!label || label.length > 140) throw new Error("invalid label");
    if (note.length > 1000) throw new Error("note too long");

    const existing = input.id
      ? await this.db.one(
          "SELECT id,ciphertext,iv,auth_tag,last_four FROM admin_api_credentials WHERE id=$1",
          [input.id]
        )
      : await this.db.one(
          "SELECT id,ciphertext,iv,auth_tag,last_four FROM admin_api_credentials WHERE config_key=$1",
          [configKey]
        );

    const rawValue = String(input.value || "").trim();
    let encrypted = existing
      ? {
          ciphertext: String(existing.ciphertext),
          iv: String(existing.iv),
          authTag: String(existing.auth_tag)
        }
      : null;
    let lastFour = existing ? String(existing.last_four || "") : "";

    if (rawValue) {
      encrypted = this.crypto.encrypt(rawValue);
      lastFour = rawValue.slice(-4);
    }
    if (!encrypted) throw new Error("credential value required");

    const row = existing
      ? await this.db.one(
          `UPDATE admin_api_credentials
           SET config_key=$2,category=$3,label=$4,ciphertext=$5,iv=$6,auth_tag=$7,
               last_four=$8,note=$9,active=$10,updated_by=$11,updated_at=now()
           WHERE id=$1
           RETURNING id`,
          [
            existing.id, configKey, category, label,
            encrypted.ciphertext, encrypted.iv, encrypted.authTag,
            lastFour, note, active, input.updatedBy || null
          ]
        )
      : await this.db.one(
          `INSERT INTO admin_api_credentials(
             config_key,category,label,ciphertext,iv,auth_tag,last_four,note,active,updated_by
           )
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            configKey, category, label,
            encrypted.ciphertext, encrypted.iv, encrypted.authTag,
            lastFour, note, active, input.updatedBy || null
          ]
        );

    await this.reload();
    return row;
  }

  async setActive(id: string, active: boolean, updatedBy?: string) {
    await this.ensureTable();
    const row = await this.db.one(
      `UPDATE admin_api_credentials
       SET active=$2,updated_by=$3,updated_at=now()
       WHERE id=$1
       RETURNING id`,
      [id, active, updatedBy || null]
    );
    await this.reload();
    return row;
  }

  async remove(id: string) {
    await this.ensureTable();
    const row = await this.db.one(
      "DELETE FROM admin_api_credentials WHERE id=$1 RETURNING id",
      [id]
    );
    await this.reload();
    return row;
  }
}
