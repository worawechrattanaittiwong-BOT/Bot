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

    const enrollment = await this.db.one(
      `SELECT ie.*,ls.assigned_user_id,ls.mode,ls.status slot_status,u.status user_status
       FROM install_enrollments ie
       JOIN license_slots ls ON ls.id=ie.slot_id
       LEFT JOIN users u ON u.id=ls.assigned_user_id
       WHERE ie.code_hash=$1
         AND ie.status='PENDING'
         AND ie.expires_at>now()
       LIMIT 1`,
      [this.crypto.sha256(code)]
    );
    if (!enrollment) throw new ConflictException("installer code expired or already used");
    if (!enrollment.assigned_user_id || enrollment.user_status !== "ACTIVE") {
      throw new ConflictException("slot is not assigned to an active SCENOVA user");
    }
    if (enrollment.mode !== "LOCAL" || !["ACTIVE", "AVAILABLE"].includes(String(enrollment.slot_status))) {
      throw new ConflictException("this installer code is not valid for a LOCAL slot");
    }

    const deviceConflict = await this.db.one(
      `SELECT bi.id,bi.slot_id,bi.device_hostname,ls.assigned_user_id
       FROM bot_instances bi
       JOIN license_slots ls ON ls.id=bi.slot_id
       WHERE bi.device_status='ACTIVE'
         AND bi.device_public_id=$1
         AND bi.slot_id<>$2
       LIMIT 1`,
      [devicePublicId.slice(0, 160), enrollment.slot_id]
    );
    if (deviceConflict) {
      throw new ConflictException(
        "เครื่องนี้มี SCENOVA Local Slot ที่ลงทะเบียนอยู่แล้ว กรุณาคืน/ย้าย Slot เดิมก่อนติดตั้ง Slot อื่นบนเครื่องเดียวกัน"
      );
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

    await this.db.query(
      "UPDATE install_enrollments SET status='USED',used_at=now() WHERE id=$1",
      [enrollment.id]
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
          preservedLegacyToken: canPreserveLegacy
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
      agentVersionRequired: "2.0.0",
      preservedLegacyToken: canPreserveLegacy
    };
  }
}
