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
  }) {
    const code = String(body.code || "").trim();
    const devicePublicId = String(body.devicePublicId || "").trim();
    const deviceSecret = String(body.deviceSecret || "").trim();
    if (code.length < 12 || devicePublicId.length < 8 || deviceSecret.length < 24) {
      throw new ConflictException("invalid SCENOVA installer enrollment");
    }

    const codeHash = this.crypto.sha256(code);
    let retryEnrollment = false;
    let enrollment = await this.db.one(
      `SELECT ie.*,ls.assigned_user_id,ls.mode,ls.status slot_status,u.status user_status
       FROM install_enrollments ie
       JOIN license_slots ls ON ls.id=ie.slot_id
       LEFT JOIN users u ON u.id=ls.assigned_user_id
       WHERE ie.code_hash=$1
         AND ie.status='PENDING'
         AND ie.expires_at>now()
       LIMIT 1`,
      [codeHash]
    );

    // If installation failed after enrollment was consumed (for example while
    // replacing the local Device Agent), allow the same installer to retry on
    // the same registered device for a short window. A different device ID
    // still cannot reuse the consumed enrollment.
    if (!enrollment) {
      enrollment = await this.db.one(
        `SELECT ie.*,ls.assigned_user_id,ls.mode,ls.status slot_status,u.status user_status
         FROM install_enrollments ie
         JOIN license_slots ls ON ls.id=ie.slot_id
         LEFT JOIN users u ON u.id=ls.assigned_user_id
         JOIN bot_instances bi ON bi.slot_id=ie.slot_id
         WHERE ie.code_hash=$1
           AND ie.status='USED'
           AND ie.used_at>now() - interval '30 minutes'
           AND bi.device_public_id=$2
         LIMIT 1`,
        [codeHash, devicePublicId.slice(0, 160)]
      );
      retryEnrollment = Boolean(enrollment);
    }

    if (!enrollment) throw new ConflictException("installer code expired, already used, or belongs to another device");
    if (!enrollment.assigned_user_id || enrollment.user_status !== "ACTIVE") {
      throw new ConflictException("slot is not assigned to an active SCENOVA user");
    }
    if (enrollment.mode !== "LOCAL" || !["ACTIVE", "AVAILABLE"].includes(String(enrollment.slot_status))) {
      throw new ConflictException("this installer code is not valid for a LOCAL slot");
    }

    let deviceConflict = await this.db.one(
      `SELECT bi.id,bi.slot_id,bi.device_hostname,ls.assigned_user_id,ls.slot_number,ls.label,ls.status slot_status,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') mt5_online
       FROM bot_instances bi
       JOIN license_slots ls ON ls.id=bi.slot_id
       WHERE bi.device_status='ACTIVE'
         AND bi.device_public_id=$1
         AND bi.slot_id<>$2
       LIMIT 1`,
      [devicePublicId.slice(0, 160), enrollment.slot_id]
    );
    if (deviceConflict) {
      const sameUser =
        String(deviceConflict.assigned_user_id || "") === String(enrollment.assigned_user_id || "");
      const slotText = deviceConflict.slot_number
        ? "Slot #" + deviceConflict.slot_number
        : "Local Slot เดิม";
      const safeToAutoRelease =
        sameUser &&
        !Boolean(deviceConflict.mt5_online) &&
        Number(deviceConflict.positions || 0) === 0;

      if (safeToAutoRelease) {
        const revoked = randomBytes(32).toString("hex");
        await this.db.query(
          `UPDATE bot_instances SET
             install_token_hash=$2,
             desired_state='STOPPED',
             actual_state='OFFLINE',
             last_seen_at=NULL,
             agent_last_seen_at=NULL,
             agent_version=NULL,
             agent_terminal_path=NULL,
             agent_ea_hash=NULL,
             device_public_id=NULL,
             device_secret_hash=NULL,
             device_status='UNREGISTERED',
             device_hostname=NULL,
             device_registered_at=NULL,
             device_last_seen_at=NULL,
             device_last_ip=NULL,
             ea_last_ip=NULL,
             pending_account_number=NULL,
             pending_broker=NULL,
             pending_broker_server=NULL,
             pending_account_ip=NULL,
             pending_account_seen_at=NULL,
             account_change_requested_at=NULL
           WHERE id=$1`,
          [deviceConflict.id, this.crypto.sha256(revoked)]
        );
        await this.db.query(
          "UPDATE install_enrollments SET status='CANCELLED' WHERE slot_id=$1 AND status='PENDING'",
          [deviceConflict.slot_id]
        );
        await this.db.query(
          "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'AUTO_RELEASE_STALE_DEVICE','bot_instance',$2,$3::jsonb)",
          [
            String(enrollment.requested_by_user_id),
            deviceConflict.id,
            JSON.stringify({
              oldSlotId: deviceConflict.slot_id,
              oldSlotNumber: deviceConflict.slot_number || null,
              newSlotId: enrollment.slot_id,
              devicePublicId,
              reason: "same_user_offline_zero_positions"
            })
          ]
        );
        deviceConflict = null;
      } else {
        throw new ConflictException(
          sameUser
            ? (
                Number(deviceConflict.positions || 0) > 0
                  ? slotText + " ยังมี Position ค้างอยู่ กรุณาปิด Position ก่อนย้าย Device"
                  : "เครื่องนี้ถูกผูกกับ " + slotText + " ซึ่งยัง Online อยู่ กรุณาหยุดบอทแล้วกด “ปลดเครื่อง” ที่ " + slotText + " ก่อนติดตั้ง Slot ใหม่"
              )
            : "เครื่องนี้เคยผูกกับ Local Slot ของบัญชี SCENOVA อื่นอยู่ กรุณาให้เจ้าของระบบปลด Device Lock ของเครื่องเดิมก่อนติดตั้ง"
        );
      }
    }

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
    const legacyToken = String(body.legacyInstallToken || "");
    const legacyInstanceId = String(body.legacyInstanceId || "");
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
          retryEnrollment
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
      agentVersionRequired: "2.0.4",
      preservedLegacyToken: canPreserveLegacy
    };
  }
}
