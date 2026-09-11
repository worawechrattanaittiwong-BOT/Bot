import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UnauthorizedException
} from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService } from "./security";
import { installerDownloadPath, isVersionExact, latestEaRelease, latestInstallerVersion } from "./release-version";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

@Controller("ea")
export class EaController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private normalizeReleaseChannel(value: unknown) {
    const raw = String(value || "Stable").trim().toUpperCase().replace(/[ _-]+/g, "_");
    if (raw === "BETA") return "Beta";
    if (raw === "ADMIN_TEST" || raw === "ADMINTEST") return "AdminTest";
    return "Stable";
  }

  private artifactPath(channel = "Stable") {
    if (channel === "AdminTest") {
      return String(process.env.EA_ARTIFACT_PATH_ADMIN_TEST || "").trim();
    }
    if (channel === "Beta") {
      return String(process.env.EA_ARTIFACT_PATH_BETA || "").trim();
    }
    return process.env.EA_ARTIFACT_PATH || "/app/apps/api/artifacts/FastBasketBot.ex5";
  }

  private artifactVersion(channel = "Stable") {
    if (channel === "AdminTest") {
      const value = String(process.env.SCENOVA_EA_VERSION_ADMIN_TEST || "").trim();
      if (value) return value;
    }
    if (channel === "Beta") {
      const value = String(process.env.SCENOVA_EA_VERSION_BETA || "").trim();
      if (value) return value;
    }
    return latestEaRelease().eaVersion;
  }

  private artifactHash(channel = "Stable") {
    const path = this.artifactPath(channel);
    if (!existsSync(path)) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  private resolveReleaseChannel(requested: unknown, instance: any) {
    const desired = this.normalizeReleaseChannel(requested);
    const elevated = ["OWNER", "ADMIN"].includes(String(instance?.user_role || ""));

    if (desired === "AdminTest" && elevated &&
        existsSync(this.artifactPath("AdminTest"))) {
      return "AdminTest";
    }
    if (desired === "Beta" &&
        (elevated || String(process.env.SCENOVA_BETA_ENABLED || "").toLowerCase() === "true") &&
        existsSync(this.artifactPath("Beta"))) {
      return "Beta";
    }

    // Optional deterministic canary rollout. Disabled unless both a beta
    // artifact exists and SCENOVA_CANARY_PERCENT is explicitly configured.
    const canary = Math.max(0, Math.min(100, Number(process.env.SCENOVA_CANARY_PERCENT || 0)));
    if (canary > 0 && existsSync(this.artifactPath("Beta"))) {
      const id = String(instance?.id || "");
      const bucket = parseInt(createHash("sha256").update(id).digest("hex").slice(0, 8), 16) % 100;
      if (bucket < canary) return "Beta";
    }

    return "Stable";
  }

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private async instance(instanceId: string, installToken: string) {
    const row = await this.db.one(
      `SELECT
         bi.*,
         COALESCE(ls.assigned_user_id,a.user_id) user_id,
         ls.status slot_status,
         a.account_number,
         a.broker,
         a.broker_server,
         a.status account_status,
         u.status user_status,
         u.role user_role
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,a.user_id)
       WHERE bi.id=$1`,
      [instanceId]
    );
    if (!row || row.install_token_hash !== this.crypto.sha256(String(installToken || ""))) {
      throw new UnauthorizedException("EA authentication failed");
    }
    if (!row.user_id || row.user_status !== "ACTIVE") {
      throw new UnauthorizedException("SCENOVA account is not active");
    }
    if (row.mt5_account_id && row.account_status !== "ACTIVE") {
      throw new UnauthorizedException("SCENOVA MT5 account is not active");
    }
    if (row.slot_id && row.slot_status && !["ACTIVE", "AVAILABLE"].includes(String(row.slot_status))) {
      throw new UnauthorizedException("SCENOVA slot is not active");
    }
    return row;
  }

  private async hasAccess(userId: string, mt5AccountId: string | null, mode: string, slotId: string | null) {
    const user = await this.db.one(
      "SELECT role,status FROM users WHERE id=$1",
      [userId]
    );
    if (user?.status === "ACTIVE" && (user.role === "OWNER" || user.role === "ADMIN")) {
      return true;
    }

    if (slotId) {
      const sub = await this.db.one(
        `SELECT 1
         FROM license_slots ls
         JOIN subscriptions s ON s.id=ls.subscription_id
         JOIN plans p ON p.id=s.plan_id
         WHERE ls.id=$1
           AND ls.assigned_user_id=$2
           AND ls.status='ACTIVE'
           AND p.mode=$3
           AND s.status='ACTIVE'
           AND s.starts_at<=now()
           AND s.expires_at>now()
         LIMIT 1`,
        [slotId, userId, mode]
      );
      if (sub) return true;
    }

    if (mt5AccountId) {
      const trial = await this.db.one(
        "SELECT 1 FROM trial_grants WHERE user_id=$1 AND mt5_account_id=$2 AND status='ACTIVE' AND expires_at>now() LIMIT 1",
        [userId, mt5AccountId]
      );
      if (trial) return true;
    }
    return false;
  }

  private async basketWinProbability(instanceId: string, symbol: string) {
    const rows = await this.db.query(
      `SELECT
         direction,
         COUNT(*) FILTER (WHERE net_profit<>0)::int AS samples,
         COUNT(*) FILTER (WHERE net_profit>0)::int AS wins
       FROM trade_journal
       WHERE bot_instance_id=$1
         AND event_type='BASKET'
         AND COALESCE((metadata->>'schema')::int,0) >= 3
         AND ($2='' OR metadata->>'symbol'=$2)
       GROUP BY direction`,
      [instanceId, symbol]
    );
    const byDirection = new Map<string, { samples: number; wins: number }>();
    for (const row of rows.rows) {
      byDirection.set(String(row.direction), {
        samples: Number(row.samples || 0),
        wins: Number(row.wins || 0)
      });
    }
    const buy = byDirection.get("BUY") || { samples: 0, wins: 0 };
    const sell = byDirection.get("SELL") || { samples: 0, wins: 0 };
    const totalSamples = buy.samples + sell.samples;
    const totalWins = buy.wins + sell.wins;
    const rate = (wins: number, samples: number) => samples > 0 ? wins / samples * 100 : 0;

    return {
      basketWinProbability: rate(totalWins, totalSamples),
      basketWinSamples: totalSamples,
      buyWinProbability: rate(buy.wins, buy.samples),
      buyWinSamples: buy.samples,
      sellWinProbability: rate(sell.wins, sell.samples),
      sellWinSamples: sell.samples
    };
  }

  private async setupPerformance(
    instanceId: string,
    symbol: string,
    decisionDirection: number,
    entryModel: string,
    marketRegime: string,
    indicatorCompositeScore: number
  ) {
    const direction = decisionDirection > 0 ? "BUY" : decisionDirection < 0 ? "SELL" : "";
    const model = String(entryModel || "").trim().slice(0, 64);
    const regime = String(marketRegime || "").trim().slice(0, 64);
    const empty = {
      setupWinProbability: 0,
      setupWinSamples: 0,
      setupAvgWin: 0,
      setupAvgLoss: 0,
      setupExpectedValue: 0,
      setupEvScore: 50,
      indicatorWinProbability: 0,
      indicatorSamples: 0,
      indicatorAvgWin: 0,
      indicatorAvgLoss: 0,
      indicatorExpectedValue: 0,
      indicatorEvScore: 50,
      setupDirection: decisionDirection > 0 ? 1 : decisionDirection < 0 ? -1 : 0,
      setupModel: model || "NONE",
      setupRegime: regime || "UNKNOWN"
    };

    // Setup intelligence is advisory only. If the EA is between decisions or
    // the model is not identified, skip the query entirely and return neutral.
    if (!direction || !model || model === "NONE") return empty;

    const useRegime = regime && !["UNKNOWN", "DISABLED", "DATA_NOT_READY"].includes(regime);
    const row = await this.db.one(
      `SELECT
         COUNT(*) FILTER (WHERE net_profit<>0)::int AS samples,
         COUNT(*) FILTER (WHERE net_profit>0)::int AS wins,
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit>0),0)::float8 AS avg_win,
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit<0),0)::float8 AS avg_loss
       FROM (
         SELECT net_profit
         FROM trade_journal
         WHERE bot_instance_id=$1
           AND event_type='BASKET'
           AND COALESCE((metadata->>'schema')::int,0) >= 3
           AND ($2='' OR metadata->>'symbol'=$2)
           AND direction=$3
           AND entry_model=$4
           AND ($5='' OR market_regime=$5)
         ORDER BY created_at DESC
         LIMIT 120
       ) recent_setup`,
      [instanceId, symbol, direction, model, useRegime ? regime : ""]
    );

    const samples = Math.max(0, Number(row?.samples || 0));
    const wins = Math.max(0, Number(row?.wins || 0));
    const avgWin = Math.max(0, Number(row?.avg_win || 0));
    const avgLoss = Math.min(0, Number(row?.avg_loss || 0));
    const winProbability = samples > 0 ? wins / samples * 100 : 0;
    const p = winProbability / 100;
    const expectedValue = p * avgWin - (1 - p) * Math.abs(avgLoss);
    const payoffScale = Math.max(0.01, avgWin + Math.abs(avgLoss));
    const evScore = samples > 0
      ? Math.max(0, Math.min(100, 50 + expectedValue / payoffScale * 100))
      : 50;

    const currentComposite = Number.isFinite(indicatorCompositeScore)
      ? Math.max(0, Math.min(100, indicatorCompositeScore))
      : 50;
    const indicatorMin = Math.max(0, Math.floor(currentComposite / 10) * 10 - 5);
    const indicatorMax = Math.min(100, Math.floor(currentComposite / 10) * 10 + 15);
    const indicatorRow = await this.db.one(
      `SELECT
         COUNT(*) FILTER (WHERE net_profit<>0)::int AS samples,
         COUNT(*) FILTER (WHERE net_profit>0)::int AS wins,
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit>0),0)::float8 AS avg_win,
         COALESCE(AVG(net_profit) FILTER (WHERE net_profit<0),0)::float8 AS avg_loss
       FROM (
         SELECT net_profit
         FROM trade_journal
         WHERE bot_instance_id=$1
           AND event_type='BASKET'
           AND COALESCE((metadata->>'schema')::int,0) >= 5
           AND ($2='' OR metadata->>'symbol'=$2)
           AND direction=$3
           AND entry_model=$4
           AND ($5='' OR market_regime=$5)
           AND NULLIF(metadata->>'indicatorCompositeScore','')::float8
               BETWEEN $6 AND $7
         ORDER BY created_at DESC
         LIMIT 160
       ) recent_indicator_context`,
      [
        instanceId,
        symbol,
        direction,
        model,
        useRegime ? regime : "",
        indicatorMin,
        indicatorMax
      ]
    );

    const indicatorSamples = Math.max(0, Number(indicatorRow?.samples || 0));
    const indicatorWins = Math.max(0, Number(indicatorRow?.wins || 0));
    const indicatorAvgWin = Math.max(0, Number(indicatorRow?.avg_win || 0));
    const indicatorAvgLoss = Math.min(0, Number(indicatorRow?.avg_loss || 0));
    const indicatorWinProbability = indicatorSamples > 0
      ? indicatorWins / indicatorSamples * 100
      : 0;
    const indicatorP = indicatorWinProbability / 100;
    const indicatorExpectedValue =
      indicatorP * indicatorAvgWin -
      (1 - indicatorP) * Math.abs(indicatorAvgLoss);
    const indicatorScale = Math.max(
      0.01,
      indicatorAvgWin + Math.abs(indicatorAvgLoss)
    );
    // Shrink small samples toward neutral. The EA also requires >=20 samples
    // before this score can influence its composite.
    const reliability = Math.min(1, indicatorSamples / 40);
    const rawIndicatorEvScore = indicatorSamples > 0
      ? Math.max(0, Math.min(
          100,
          50 + indicatorExpectedValue / indicatorScale * 100
        ))
      : 50;
    const indicatorEvScore =
      50 + (rawIndicatorEvScore - 50) * reliability;

    return {
      ...empty,
      setupWinProbability: winProbability,
      setupWinSamples: samples,
      setupAvgWin: avgWin,
      setupAvgLoss: avgLoss,
      setupExpectedValue: expectedValue,
      setupEvScore: evScore,
      indicatorWinProbability,
      indicatorSamples,
      indicatorAvgWin,
      indicatorAvgLoss,
      indicatorExpectedValue,
      indicatorEvScore
    };
  }

  @Post("heartbeat")
  async heartbeat(
    @Req() req: any,
    @Body() body: {
      instanceId: string;
      installToken: string;
      state: string;
      metrics?: Record<string, any>;
    }
  ) {
    const instance = await this.instance(body.instanceId, body.installToken);
    const eaIp = this.clientIp(req);
    const metrics = body.metrics || {};

    // Device/Agent metadata is not a trading permission. The authenticated
    // instance token, live MT5 identity and Server entitlement are authoritative.
    const reportedAccount = String(metrics.accountNumber || "").trim();
    const reportedServer = String(metrics.server || "").trim();
    const reportedBroker = String(metrics.broker || "").trim();

    // First LOCAL connection is bound automatically from the MT5 runtime.
    // Customers never type an MT5 account number for LOCAL mode. The installer
    // already authenticates the SCENOVA slot/device, and the EA reports the
    // actual MT5 login + server directly from the terminal.
    if (
      !instance.mt5_account_id &&
      instance.mode === "LOCAL" &&
      reportedAccount &&
      reportedServer
    ) {
      const conflict = await this.db.one(
        `SELECT a.id,a.user_id,bi.slot_id
         FROM mt5_accounts a
         LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
         WHERE lower(a.account_number)=lower($1)
           AND lower(a.broker_server)=lower($2)
           AND a.status='ACTIVE'
           AND (
             a.user_id<>$3
             OR (bi.slot_id IS NOT NULL AND bi.slot_id<>$4)
           )
         LIMIT 1`,
        [reportedAccount, reportedServer, instance.user_id, instance.slot_id]
      );

      if (conflict) {
        await this.db.query(
          `UPDATE bot_instances SET
             actual_state='SAFE_STOP',
             desired_state='SAFE_STOP',
             last_seen_at=now(),
             ea_last_ip=$2,
             metrics=$3::jsonb,
             pending_account_number=$4,
             pending_broker=$5,
             pending_broker_server=$6,
             pending_account_ip=$2,
             pending_account_seen_at=now()
           WHERE id=$1`,
          [
            instance.id,
            eaIp,
            JSON.stringify(metrics),
            reportedAccount,
            reportedBroker || null,
            reportedServer
          ]
        );
        return {
          ok: true,
          access: false,
          desiredState: "SAFE_STOP",
          accountConflict: true,
          detectedAccount: reportedAccount,
          detectedBroker: reportedBroker || null,
          detectedServer: reportedServer,
          message: "MT5 นี้ถูกผูกกับ SCENOVA Slot อื่นอยู่แล้ว",
          settings: {}
        };
      }

      let account = await this.db.one(
        `SELECT *
         FROM mt5_accounts
         WHERE user_id=$1
           AND lower(account_number)=lower($2)
           AND lower(broker_server)=lower($3)
         ORDER BY created_at DESC
         LIMIT 1`,
        [instance.user_id, reportedAccount, reportedServer]
      );

      if (account) {
        account = await this.db.one(
          "UPDATE mt5_accounts SET broker=$2,mode='LOCAL',status='ACTIVE' WHERE id=$1 RETURNING *",
          [account.id, reportedBroker || account.broker || "Detected MT5"]
        );
      } else {
        account = await this.db.one(
          "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode,status) VALUES($1,$2,$3,$4,'LOCAL','ACTIVE') RETURNING *",
          [
            instance.user_id,
            reportedAccount,
            reportedBroker || "Detected MT5",
            reportedServer
          ]
        );
      }

      await this.db.query(
        `UPDATE bot_instances SET
           mt5_account_id=$2,
           desired_state='STOPPED',
           actual_state=$3,
           last_seen_at=now(),
           ea_last_ip=$4,
           metrics=$5::jsonb,
           pending_account_number=NULL,
           pending_broker=NULL,
           pending_broker_server=NULL,
           pending_account_ip=NULL,
           pending_account_seen_at=NULL,
           account_change_requested_at=NULL
         WHERE id=$1`,
        [
          instance.id,
          account.id,
          String(body.state || "STOPPED").slice(0, 24),
          eaIp,
          JSON.stringify(metrics)
        ]
      );

      await this.db.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'AUTO_BIND_MT5','bot_instance',$2,$3::jsonb)",
        [
          "EA:" + String(instance.user_id),
          instance.id,
          JSON.stringify({
            slotId: instance.slot_id,
            accountNumber: reportedAccount,
            brokerServer: reportedServer,
            source: "LOCAL_RUNTIME"
          })
        ]
      );

      instance.mt5_account_id = account.id;
      instance.account_number = account.account_number;
      instance.broker = account.broker;
      instance.broker_server = account.broker_server;
      instance.account_status = "ACTIVE";
      instance.desired_state = "STOPPED";
    }

    const accountMismatch =
      Boolean(reportedAccount) &&
      (
        !instance.mt5_account_id ||
        reportedAccount !== String(instance.account_number || "") ||
        (reportedServer && instance.broker_server && reportedServer !== String(instance.broker_server))
      );

    if (accountMismatch) {
      const previousBoundPositions = Number(
        instance.metrics?.previousBoundPositions ??
        instance.metrics?.positions ??
        0
      );
      const mismatchMetrics = {
        ...metrics,
        previousBoundPositions
      };

      await this.db.query(
        `UPDATE bot_instances SET
           actual_state='SAFE_STOP',
           desired_state='SAFE_STOP',
           last_seen_at=now(),
           ea_last_ip=$2,
           metrics=$3::jsonb,
           pending_account_number=$4,
           pending_broker=$5,
           pending_broker_server=$6,
           pending_account_ip=$2,
           pending_account_seen_at=now()
         WHERE id=$1`,
        [
          instance.id,
          eaIp,
          JSON.stringify(mismatchMetrics),
          reportedAccount,
          reportedBroker || null,
          reportedServer || "UNKNOWN"
        ]
      );
      return {
        ok: true,
        access: false,
        desiredState: "SAFE_STOP",
        accountMismatch: true,
        detectedAccount: reportedAccount,
        detectedBroker: reportedBroker || null,
        detectedServer: reportedServer || null,
        previousBoundPositions,
        accountChangeBlocked: previousBoundPositions > 0,
        settings: {}
      };
    }

    const access = await this.hasAccess(
      instance.user_id,
      instance.mt5_account_id || null,
      instance.mode,
      instance.slot_id || null
    );

    const dailyProfitUnlockRequested =
      instance.metrics?.dailyProfitUnlockRequested === true;
    const dailyProfitLocked =
      metrics.dailyProfitLocked === true && !dailyProfitUnlockRequested;

    // The first heartbeat after a user raises/disables the Daily Profit target
    // may still carry the old EA lock bit. Let that one heartbeat deliver the
    // new settings instead of immediately forcing SAFE_STOP again.
    if ((!access || dailyProfitLocked) && instance.desired_state === "RUNNING") {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1",
        [instance.id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
        [instance.id]
      );
    }

    await this.db.query(
      "UPDATE bot_instances SET actual_state=$2,last_seen_at=now(),ea_last_ip=$3,metrics=$4::jsonb WHERE id=$1",
      [
        instance.id,
        String(body.state || "UNKNOWN").slice(0, 24),
        eaIp,
        JSON.stringify(metrics)
      ]
    );

    // Re-read the control state immediately before responding so a Start/Stop
    // click that happened during this heartbeat cannot be overwritten by stale data.
    const latestControl = await this.db.one(
      "SELECT desired_state FROM bot_instances WHERE id=$1",
      [instance.id]
    );
    const effectiveDesired = access
      ? String(latestControl?.desired_state || "STOPPED")
      : "SAFE_STOP";
    const cmd = await this.db.one(
      `SELECT id,command,payload
       FROM bot_commands
       WHERE bot_instance_id=$1
         AND (status='PENDING' OR (status='DELIVERED' AND delivered_at < now() - interval '10 seconds'))
         AND (
           command NOT IN ('START','SAFE_STOP','CLOSE_ALL')
           OR (command='START' AND $2='RUNNING')
           OR (command='SAFE_STOP' AND $2='SAFE_STOP')
           OR (command='CLOSE_ALL' AND $2='STOPPED')
         )
       ORDER BY id DESC
       LIMIT 1`,
      [instance.id, effectiveDesired]
    );
    if (cmd) {
      await this.db.query(
        "UPDATE bot_commands SET status='DELIVERED',delivered_at=now() WHERE id=$1",
        [cmd.id]
      );
    }

    const settings = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );
    // Runtime contract: every customer-facing mode chooses BUY/SELL itself.
    // Override stale legacy direction locks before settings reach the EA.
    const runtimeSettings = {
      ...(settings?.settings || {}),
      entryMode: "AUTO_MOMENTUM"
    };
    const intelligenceStats = await this.basketWinProbability(
      instance.id,
      String(metrics.symbol || "").trim()
    );
    const setupStats = await this.setupPerformance(
      instance.id,
      String(metrics.symbol || "").trim(),
      Number(metrics.decisionDirection || 0),
      String(metrics.entryModel || ""),
      String(metrics.marketRegime || ""),
      Number(metrics.indicatorCompositeScore ?? 50)
    );

    return {
      ok: true,
      access,
      desiredState: effectiveDesired,
      command: cmd || null,
      commandId: cmd?.id || null,
      commandName: cmd?.command || null,
      commandPayload: cmd?.payload || null,
      settings: runtimeSettings,
      ...intelligenceStats,
      ...setupStats
    };
  }

  @Post("journal")
  async journal(@Body() body: {
    instanceId: string;
    installToken: string;
    dealTicket: string | number;
    positionId?: string | number;
    eventType: string;
    direction: string;
    volume?: number;
    price?: number;
    netProfit?: number;
    entryTrigger?: string;
    entryModel?: string;
    entryQuality?: string;
    entryQualityScore?: number;
    marketRegime?: string;
    marketRegimeDetail?: string;
    fibSetupScore?: number;
    orderBlockQuality?: number;
    confidence?: number;
    basketIndex?: number;
    symbol?: string;
    brokerServer?: string;
    startedAt?: number;
    endedAt?: number;
    peakPositions?: number;
    sessionProfile?: string;
    journalSchema?: number;
    marketCycleState?: string;
    entryPrecisionState?: string;
    liquidityState?: string;
    microStructureState?: string;
    fvgState?: string;
    entryPrecisionScore?: number;
    entryDistanceAtr?: number;
    setupEvScore?: number;
    indicatorLocationScore?: number;
    indicatorMomentumScore?: number;
    indicatorStructureScore?: number;
    indicatorVolatilityScore?: number;
    indicatorExecutionScore?: number;
    indicatorCostSpaceScore?: number;
    indicatorCompositeScore?: number;
    volumeProfileState?: string;
    squeezeState?: string;
    macdState?: string;
    levelFlipState?: string;
    premiumDiscountState?: string;
  }) {
    const instance = await this.instance(body.instanceId, body.installToken);

    const eventType = String(body.eventType || "").toUpperCase();
    const direction = String(body.direction || "").toUpperCase();
    const dealTicket = String(body.dealTicket ?? "").trim();
    const positionId = String(body.positionId ?? "").trim();

    if (!["ENTRY", "EXIT", "BASKET"].includes(eventType)) {
      throw new BadRequestException("Journal event type is invalid");
    }
    if (!["BUY", "SELL"].includes(direction)) {
      throw new BadRequestException("Journal direction is invalid");
    }
    if (!/^\d+$/.test(dealTicket)) {
      throw new BadRequestException("Journal deal ticket is invalid");
    }
    if (positionId && !/^\d+$/.test(positionId)) {
      throw new BadRequestException("Journal position id is invalid");
    }

    const n = (value: unknown, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const text = (value: unknown, max = 64) =>
      String(value ?? "").trim().slice(0, max) || null;

    await this.db.query(
      `INSERT INTO trade_journal(
         bot_instance_id,mt5_account_id,deal_ticket,position_id,event_type,direction,
         volume,price,net_profit,entry_trigger,entry_model,entry_quality,
         entry_quality_score,market_regime,market_regime_detail,fib_setup_score,
         order_block_quality,confidence,basket_index,metadata
       )
       VALUES(
         $1,$2,$3::bigint,NULLIF($4,'')::bigint,$5,$6,
         $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb
       )
       ON CONFLICT(bot_instance_id,deal_ticket,event_type) DO NOTHING`,
      [
        instance.id,
        instance.mt5_account_id || null,
        dealTicket,
        positionId,
        eventType,
        direction,
        Math.max(0, n(body.volume)),
        Math.max(0, n(body.price)),
        n(body.netProfit),
        text(body.entryTrigger),
        text(body.entryModel),
        text(body.entryQuality, 8),
        Math.max(0, Math.min(100, n(body.entryQualityScore))),
        text(body.marketRegime),
        text(body.marketRegimeDetail),
        Math.max(0, Math.min(100, n(body.fibSetupScore))),
        Math.max(0, Math.min(100, n(body.orderBlockQuality))),
        Math.max(0, Math.min(100, n(body.confidence))),
        Math.max(0, Math.trunc(n(body.basketIndex))),
        JSON.stringify({
          source: "EA",
          schema: eventType === "BASKET"
            ? Math.max(2, Math.min(5, Math.trunc(n(body.journalSchema, 2))))
            : 1,
          symbol: text(body.symbol, 48),
          brokerServer: text(body.brokerServer, 96),
          startedAt: Math.max(0, Math.trunc(n(body.startedAt))),
          endedAt: Math.max(0, Math.trunc(n(body.endedAt))),
          peakPositions: Math.max(0, Math.trunc(n(body.peakPositions))),
          sessionProfile: text(body.sessionProfile, 32),
          marketCycleState: text(body.marketCycleState, 48),
          entryPrecisionState: text(body.entryPrecisionState, 48),
          liquidityState: text(body.liquidityState, 64),
          microStructureState: text(body.microStructureState, 64),
          fvgState: text(body.fvgState, 64),
          entryPrecisionScore: Math.max(0, Math.min(100, n(body.entryPrecisionScore, 50))),
          entryDistanceAtr: Math.max(0, n(body.entryDistanceAtr)),
          setupEvScore: Math.max(0, Math.min(100, n(body.setupEvScore, 50))),
          indicatorLocationScore: Math.max(0, Math.min(100, n(body.indicatorLocationScore, 50))),
          indicatorMomentumScore: Math.max(0, Math.min(100, n(body.indicatorMomentumScore, 50))),
          indicatorStructureScore: Math.max(0, Math.min(100, n(body.indicatorStructureScore, 50))),
          indicatorVolatilityScore: Math.max(0, Math.min(100, n(body.indicatorVolatilityScore, 50))),
          indicatorExecutionScore: Math.max(0, Math.min(100, n(body.indicatorExecutionScore, 50))),
          indicatorCostSpaceScore: Math.max(0, Math.min(100, n(body.indicatorCostSpaceScore, 50))),
          indicatorCompositeScore: Math.max(0, Math.min(100, n(body.indicatorCompositeScore, 50))),
          volumeProfileState: text(body.volumeProfileState, 48),
          squeezeState: text(body.squeezeState, 48),
          macdState: text(body.macdState, 48),
          levelFlipState: text(body.levelFlipState, 48),
          premiumDiscountState: text(body.premiumDiscountState, 32)
        })
      ]
    );

    return { ok: true };
  }

  @Post("agent-heartbeat")
  async agentHeartbeat(
    @Req() req: any,
    @Body() body: {
      instanceId: string;
      installToken: string;
      agentVersion?: string;
      terminalPath?: string;
      eaHash?: string;
      hostname?: string;
      devicePublicId?: string;
      deviceSecret?: string;
      releaseChannel?: string;
      installerStatus?: {
        version?: string;
        channel?: string;
        localHash?: string;
        stagedUpdate?: boolean;
        healthScore?: number;
        profileCount?: number;
      };
    }
  ) {
    const instance = await this.instance(body.instanceId, body.installToken);
    const publicId = String(body.devicePublicId || "").trim();
    const secret = String(body.deviceSecret || "").trim();
    const deviceReported = publicId.length >= 8 && secret.length >= 24;
    const deviceVerified = deviceReported;

    const ip = this.clientIp(req);
    const installerStatus = body.installerStatus && typeof body.installerStatus === "object"
      ? {
          version: String(body.installerStatus.version || "").slice(0, 32),
          channel: this.normalizeReleaseChannel(body.installerStatus.channel),
          localHash: String(body.installerStatus.localHash || "").slice(0, 128),
          stagedUpdate: Boolean(body.installerStatus.stagedUpdate),
          healthScore: Math.max(0, Math.min(100, Number(body.installerStatus.healthScore || 0))),
          profileCount: Math.max(0, Math.min(50, Math.trunc(Number(body.installerStatus.profileCount || 0)))),
          reportedAt: new Date().toISOString()
        }
      : null;

    await this.db.query(
      `UPDATE bot_instances SET
         agent_last_seen_at=now(),
         agent_version=$2,
         agent_terminal_path=$3,
         agent_ea_hash=$4,
         device_hostname=COALESCE(NULLIF($5,''),device_hostname),
         device_public_id=CASE WHEN $6::boolean THEN $7 ELSE device_public_id END,
         device_secret_hash=CASE WHEN $6::boolean THEN $8 ELSE device_secret_hash END,
         device_status=CASE WHEN $6::boolean THEN 'ACTIVE' ELSE device_status END,
         device_last_seen_at=CASE WHEN $6::boolean THEN now() ELSE device_last_seen_at END,
         device_last_ip=CASE WHEN $6::boolean THEN $9 ELSE device_last_ip END,
         metrics=CASE
           WHEN $10::jsonb IS NULL THEN metrics
           ELSE jsonb_set(COALESCE(metrics,'{}'::jsonb),'{installer}', $10::jsonb, true)
         END
       WHERE id=$1`,
      [
        instance.id,
        String(body.agentVersion || "").slice(0, 32) || null,
        String(body.terminalPath || "").slice(0, 1000) || null,
        String(body.eaHash || "").slice(0, 128) || null,
        String(body.hostname || "").slice(0, 160),
        deviceReported,
        publicId.slice(0, 160),
        deviceReported ? this.crypto.sha256(secret) : null,
        ip,
        installerStatus ? JSON.stringify(installerStatus) : null
      ]
    );

    const releaseChannel = this.resolveReleaseChannel(body.releaseChannel, instance);
    const serverEaHash = this.artifactHash(releaseChannel);
    const runtime = await this.db.one(
      `SELECT
         last_seen_at,
         desired_state,
         actual_state,
         COALESCE(NULLIF(metrics->>'positions','')::int,0) AS positions,
         metrics->>'eaVersion' AS ea_version,
         metrics->>'accountNumber' AS reported_account_number,
         metrics->>'server' AS reported_server,
         metrics->>'broker' AS reported_broker,
         metrics->>'terminalTradeAllowed' AS terminal_trade_allowed,
         metrics->>'mqlTradeAllowed' AS mql_trade_allowed,
         CASE
           WHEN last_seen_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (now()-last_seen_at))
         END AS ea_last_seen_age_seconds
       FROM bot_instances
       WHERE id=$1`,
      [instance.id]
    );
    const eaLastSeenAgeSeconds =
      runtime?.ea_last_seen_age_seconds === null || runtime?.ea_last_seen_age_seconds === undefined
        ? -1
        : Number(runtime.ea_last_seen_age_seconds);

    const agentVersionRequired = latestInstallerVersion();
    const reportedAgentVersion = String(body.agentVersion || "").trim();
    const agentUpdateRequired = !isVersionExact(reportedAgentVersion, agentVersionRequired);

    return {
      ok: true,
      instanceId: instance.id,
      deviceVerified,
      artifactAvailable: Boolean(serverEaHash),
      artifactHash: serverEaHash,
      artifactName: "FastBasketBot.ex5",
      artifactEndpoint: "/api/ea/artifact",
      eaOnline: eaLastSeenAgeSeconds >= 0 && eaLastSeenAgeSeconds <= 10,
      eaVersion: String(runtime?.ea_version || ""),
      eaLastSeenAgeSeconds,
      terminalTradeAllowed:
        runtime?.terminal_trade_allowed === "true"
          ? true
          : runtime?.terminal_trade_allowed === "false"
            ? false
            : null,
      mqlTradeAllowed:
        runtime?.mql_trade_allowed === "true"
          ? true
          : runtime?.mql_trade_allowed === "false"
            ? false
            : null,
      safeToRestart:
        String(runtime?.desired_state || "STOPPED") !== "RUNNING" &&
        String(runtime?.actual_state || "STOPPED") !== "RUNNING" &&
        Number(runtime?.positions || 0) <= 0,
      positions: Number(runtime?.positions || 0),
      desiredState: String(runtime?.desired_state || "STOPPED"),
      actualState: String(runtime?.actual_state || "STOPPED"),
      accountNumber: String(runtime?.reported_account_number || instance?.account_number || ""),
      server: String(runtime?.reported_server || instance?.broker_server || ""),
      broker: String(runtime?.reported_broker || instance?.broker || ""),
      eaVersionRequired: this.artifactVersion(releaseChannel),
      releaseChannel,
      agentVersion: reportedAgentVersion,
      agentVersionRequired,
      agentUpdateRequired,
      agentDownloadUrl: installerDownloadPath(agentVersionRequired)
    };
  }

  @Post("artifact")
  @Header("Content-Type", "application/octet-stream")
  @Header("Content-Disposition", 'attachment; filename="FastBasketBot.ex5"')
  async artifact(
    @Body() body: {
      instanceId: string;
      installToken: string;
      offset?: number;
      releaseChannel?: string;
    },
    @Res({ passthrough: true }) res: any
  ) {
    const instance = await this.instance(body.instanceId, body.installToken);
    const releaseChannel = this.resolveReleaseChannel(body.releaseChannel, instance);
    const path = this.artifactPath(releaseChannel);
    if (!existsSync(path)) {
      throw new ServiceUnavailableException("EA production artifact is not published yet");
    }

    const bytes = readFileSync(path);
    const requestedOffset = Math.max(0, Math.trunc(Number(body.offset || 0)));
    const offset = Math.min(requestedOffset, bytes.length);
    res.setHeader("X-SCENOVA-Artifact-Offset", String(offset));
    res.setHeader("X-SCENOVA-Artifact-Total", String(bytes.length));
    res.setHeader("X-SCENOVA-Release-Channel", releaseChannel);
    res.setHeader("X-SCENOVA-EA-Version", this.artifactVersion(releaseChannel));

    return new StreamableFile(bytes.subarray(offset));
  }

  @Post("ack")
  async ack(@Body() body: {
    instanceId: string;
    installToken: string;
    commandId: number;
    state?: string;
    executionStatus?: string;
  }) {
    await this.instance(body.instanceId, body.installToken);

    const state = String(body.state || "");
    const executionStatus = String(body.executionStatus || "").slice(0, 64);
    if (["RUNNING", "SAFE_STOP", "STOPPED"].includes(state)) {
      await this.db.query(
        `UPDATE bot_instances
         SET actual_state=$2,
             last_seen_at=now(),
             metrics=jsonb_set(COALESCE(metrics,'{}'::jsonb),'{executionStatus}',to_jsonb($3::text),true)
         WHERE id=$1`,
        [body.instanceId, state, executionStatus || state]
      );
    }

    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE id=$1 AND bot_instance_id=$2",
      [body.commandId, body.instanceId]
    );
    return { ok: true };
  }
}
