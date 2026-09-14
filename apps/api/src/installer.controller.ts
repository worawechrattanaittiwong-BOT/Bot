import {
  Body,
  ConflictException,
  Controller,
  Post
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DbService } from "./db.service";
import { CryptoService } from "./security";
import { latestEaRelease, latestInstallerVersion } from "./release-version";

@Controller("installer")
export class InstallerController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private artifactPath() {
    return process.env.EA_ARTIFACT_PATH || "/app/apps/api/artifacts/FastBasketBot.ex5";
  }

  private artifactHash() {
    const path = this.artifactPath();
    if (!existsSync(path)) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  @Post("enroll")
  async enroll(@Body() body: {
    code: string;
    devicePublicId: string;
    deviceSecret: string;
    hostname?: string;
    terminalPath?: string;
    legacyInstanceId?: string;
    legacyInstallToken?: string;
    releaseChannel?: string;
  }) {
    const code = String(body.code || "").trim();
    const devicePublicId = String(body.devicePublicId || "").trim();
    const deviceSecret = String(body.deviceSecret || "").trim();
    if (code.length < 12 || devicePublicId.length < 8 || deviceSecret.length < 24) {
      throw new ConflictException("invalid SCENOVA installer enrollment");
    }

    const codeHash = this.crypto.sha256(code);
    const legacyToken = String(body.legacyInstallToken || "").trim();
    const legacyInstanceId = String(body.legacyInstanceId || "").trim();
    const legacyTokenHash = legacyToken.length >= 8
      ? this.crypto.sha256(legacyToken)
      : "";

    let retryEnrollment = false;
    let authenticatedReinstall = false;
    let enrollment = await this.db.one(
      `SELECT ie.*,ls.assigned_user_id,ls.mode,ls.status slot_status,u.status user_status,u.role user_role
       FROM install_enrollments ie
       JOIN license_slots ls ON ls.id=ie.slot_id
       LEFT JOIN users u ON u.id=ls.assigned_user_id
       WHERE ie.code_hash=$1
         AND ie.status='PENDING'
         AND ie.expires_at>now()
       LIMIT 1`,
      [codeHash]
    );

    // An already authenticated SCENOVA installation may repair/update itself
    // even if the filename enrollment code is old. The existing instance ID +
    // install token must still match the same Slot, so this does not bypass
    // Server authorization.
    if (!enrollment && legacyInstanceId && legacyTokenHash) {
      enrollment = await this.db.one(
        `SELECT ie.*,ls.assigned_user_id,ls.mode,ls.status slot_status,u.status user_status,u.role user_role
         FROM install_enrollments ie
         JOIN license_slots ls ON ls.id=ie.slot_id
         LEFT JOIN users u ON u.id=ls.assigned_user_id
         JOIN bot_instances bi ON bi.slot_id=ie.slot_id
         WHERE ie.code_hash=$1
           AND ie.status IN ('PENDING','USED','CANCELLED')
           AND bi.id=$2
           AND bi.install_token_hash=$3
         LIMIT 1`,
        [codeHash, legacyInstanceId, legacyTokenHash]
      );
      retryEnrollment = Boolean(enrollment);
      authenticatedReinstall = Boolean(enrollment);
    }

    // If a first install failed after the Server consumed the code, installer
    // v2.0.9 keeps the same pending device identity so the same PC can retry
    // safely for 24 hours.
    if (!enrollment) {
      enrollment = await this.db.one(
        `SELECT ie.*,ls.assigned_user_id,ls.mode,ls.status slot_status,u.status user_status,u.role user_role
         FROM install_enrollments ie
         JOIN license_slots ls ON ls.id=ie.slot_id
         LEFT JOIN users u ON u.id=ls.assigned_user_id
         JOIN bot_instances bi ON bi.slot_id=ie.slot_id
         WHERE ie.code_hash=$1
           AND ie.status='USED'
           AND ie.used_at>now() - interval '24 hours'
           AND bi.device_public_id=$2
         LIMIT 1`,
        [codeHash, devicePublicId.slice(0, 160)]
      );
      retryEnrollment = Boolean(enrollment);
    }

    if (!enrollment) {
      throw new ConflictException(
        "รหัสติดตั้งหมดอายุหรือถูกใช้จากเครื่องอื่นแล้ว กรุณากลับหน้า SCENOVA Control Center และดาวน์โหลด Setup ใหม่"
      );
    }
    if (!enrollment.assigned_user_id || enrollment.user_status !== "ACTIVE") {
      throw new ConflictException("SCENOVA account is not active for this installer");
    }
    if (enrollment.mode !== "LOCAL" || !["ACTIVE", "AVAILABLE"].includes(String(enrollment.slot_status))) {
      throw new ConflictException("this installer code is not valid for LOCAL mode");
    }

    // Device identity is installation telemetry only. A valid Slot enrollment
    // may be installed on any PC; trading authorization is decided by the
    // Slot token + live MT5 identity + Server entitlement on every heartbeat.
    let instance = await this.db.one(
      "SELECT * FROM bot_instances WHERE slot_id=$1",
      [enrollment.slot_id]
    );
    if (!instance) {
      const placeholder = randomBytes(32).toString("hex");
      instance = await this.db.one(
        "INSERT INTO bot_instances(slot_id,mt5_account_id,mode,install_token_hash) VALUES($1,NULL,'LOCAL',$2) RETURNING *",
        [enrollment.slot_id, this.crypto.sha256(placeholder)]
      );
      await this.db.query(
        "INSERT INTO bot_settings(bot_instance_id) VALUES($1) ON CONFLICT(bot_instance_id) DO NOTHING",
        [instance.id]
      );
    }

    let installToken = "";
    const canPreserveLegacy =
      legacyToken.length >= 8 &&
      legacyInstanceId === String(instance.id) &&
      this.crypto.sha256(legacyToken) === String(instance.install_token_hash);

    if (canPreserveLegacy) {
      installToken = legacyToken;
    } else {
      installToken = randomBytes(32).toString("hex");
    }

    await this.db.query(
      `UPDATE bot_instances SET
         install_token_hash=$2,
         device_public_id=$3,
         device_secret_hash=$4,
         device_status='ACTIVE',
         device_hostname=$5,
         device_registered_at=now(),
         device_last_seen_at=NULL,
         device_last_ip=NULL,
         agent_terminal_path=$6,
         actual_state=CASE WHEN actual_state='RUNNING' THEN 'SAFE_STOP' ELSE actual_state END,
         desired_state=CASE WHEN desired_state='RUNNING' THEN 'SAFE_STOP' ELSE desired_state END
       WHERE id=$1`,
      [
        instance.id,
        this.crypto.sha256(installToken),
        devicePublicId.slice(0, 160),
        this.crypto.sha256(deviceSecret),
        String(body.hostname || "").slice(0, 160) || null,
        String(body.terminalPath || "").slice(0, 1000) || null
      ]
    );

    if (!retryEnrollment) {
      await this.db.query(
        "UPDATE install_enrollments SET status='USED',used_at=now() WHERE id=$1",
        [enrollment.id]
      );
    }
    const linkedAccount = await this.db.one(
      `SELECT a.account_number,a.broker_server
       FROM bot_instances bi
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.id=$1`,
      [instance.id]
    );

    const requestedChannel = String(body.releaseChannel || "Stable").trim().toUpperCase();
    const elevated = ["OWNER", "ADMIN"].includes(String(enrollment.user_role || ""));
    const releaseChannel =
      requestedChannel === "ADMINTEST" || requestedChannel === "ADMIN_TEST"
        ? (elevated ? "AdminTest" : "Stable")
        : requestedChannel === "BETA"
          ? (elevated || String(process.env.SCENOVA_BETA_ENABLED || "").toLowerCase() === "true"
              ? "Beta"
              : "Stable")
          : "Stable";

    const startup = await this.db.one(
      `SELECT COALESCE(
           NULLIF(bi.metrics->>'symbol',''),
           NULLIF(bs.settings->>'symbol',''),
           'XAUUSD'
         ) AS startup_symbol
       FROM bot_instances bi
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE bi.id=$1`,
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'ENROLL_DEVICE','bot_instance',$2,$3::jsonb)",
      [
        String(enrollment.requested_by_user_id),
        instance.id,
        JSON.stringify({
          slotId: enrollment.slot_id,
          devicePublicId,
          hostname: body.hostname || null,
          preservedLegacyToken: canPreserveLegacy,
          retryEnrollment,
          authenticatedReinstall
        })
      ]
    );

    return {
      ok: true,
      instanceId: instance.id,
      slotId: enrollment.slot_id,
      installToken,
      devicePublicId,
      apiBase: process.env.PUBLIC_API_BASE || "https://snvea-bot.online/backend",
      webBase: process.env.PUBLIC_WEB_BASE || "https://snvea-bot.online",
      artifactHash: this.artifactHash(),
      artifactEndpoint: "/api/ea/artifact",
      startupSymbol: String(startup?.startup_symbol || "XAUUSD"),
      agentVersionRequired: latestInstallerVersion(),
      eaVersionRequired: latestEaRelease().eaVersion,
      releaseChannel,
      expectedAccountNumber: String(linkedAccount?.account_number || "") || null,
      expectedServer: String(linkedAccount?.broker_server || "") || null,
      preservedLegacyToken: canPreserveLegacy,
      retryEnrollment,
      authenticatedReinstall
    };
  }

  @Post("telemetry")
  async telemetry(@Body() body: {
    instanceId: string;
    installToken: string;
    installerVersion?: string;
    action?: string;
    result?: string;
    errorCode?: string;
    healthScore?: number;
    terminalCount?: number;
    selectedTerminal?: string;
    releaseChannel?: string;
    components?: Record<string, unknown>;
  }) {
    const instanceId = String(body.instanceId || "").trim();
    const token = String(body.installToken || "").trim();
    if (!instanceId || token.length < 8) {
      throw new ConflictException("invalid installer telemetry authentication");
    }

    const instance = await this.db.one(
      `SELECT bi.id,COALESCE(ls.assigned_user_id,a.user_id) user_id,bi.install_token_hash
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.id=$1`,
      [instanceId]
    );
    if (!instance || String(instance.install_token_hash) !== this.crypto.sha256(token)) {
      throw new ConflictException("invalid installer telemetry authentication");
    }

    const detail = {
      installerVersion: String(body.installerVersion || "").slice(0, 32),
      action: String(body.action || "").slice(0, 64),
      result: String(body.result || "").slice(0, 64),
      errorCode: String(body.errorCode || "").slice(0, 64),
      healthScore: Math.max(0, Math.min(100, Number(body.healthScore || 0))),
      terminalCount: Math.max(0, Math.min(50, Math.trunc(Number(body.terminalCount || 0)))),
      selectedTerminal: String(body.selectedTerminal || "").slice(0, 1000),
      releaseChannel: String(body.releaseChannel || "Stable").slice(0, 32),
      components: body.components && typeof body.components === "object"
        ? body.components
        : {},
      reportedAt: new Date().toISOString()
    };

    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'INSTALLER_TELEMETRY','bot_instance',$2,$3::jsonb)",
      [
        String(instance.user_id || "SYSTEM"),
        instance.id,
        JSON.stringify(detail)
      ]
    );

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=jsonb_set(
         COALESCE(metrics,'{}'::jsonb),
         '{installerTelemetry}',
         $2::jsonb,
         true
       )
       WHERE id=$1`,
      [instance.id, JSON.stringify(detail)]
    );

    return { ok: true };
  }
}
