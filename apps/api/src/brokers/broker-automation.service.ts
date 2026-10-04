import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { DbService } from "../db.service";
import { BrokerBenefitService } from "./broker-benefit.service";
import { BrokerFinanceService } from "./broker-finance.service";
import { ExnessPartnershipApiService } from "./exness-partnership-api.service";

type TriggerType = "MANUAL" | "SCHEDULED";

@Injectable()
export class BrokerAutomationService
  implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DbService,
    private readonly api: ExnessPartnershipApiService,
    private readonly benefits: BrokerBenefitService,
    private readonly finance: BrokerFinanceService
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.runDue().catch(() => {});
    }, 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private value(item: any, keys: string[]) {
    for (const key of keys) {
      const parts = key.split(".");
      let current = item;
      for (const part of parts) current = current?.[part];
      if (current !== undefined && current !== null && String(current).trim() !== "") {
        return current;
      }
    }
    return null;
  }

  private text(item: any, keys: string[]) {
    const value = this.value(item, keys);
    return value === null ? "" : String(value).trim();
  }

  private clientRef(item: any) {
    return this.text(item, [
      "external_client_ref","externalClientRef","client_id","clientId",
      "client_uid","clientUid","user_id","userId","client.id","id"
    ]).slice(0,180);
  }

  private accountNumber(item: any) {
    return this.text(item, [
      "account_number","accountNumber","mt5_account","mt5Account",
      "trading_account","tradingAccount","account.login","login"
    ]).replace(/[^0-9]/g,"").slice(0,32);
  }

  private async matchUserByAccount(accountNumber: string) {
    if (!accountNumber) return null;
    return this.db.one(
      `SELECT u.id
       FROM mt5_accounts a
       JOIN users u ON u.id=a.user_id
       WHERE a.account_number=$1
         AND (
           upper(trim(COALESCE(a.broker,''))) LIKE 'EXNESS%'
           OR upper(trim(COALESCE(a.broker_server,''))) LIKE 'EXNESS%'
         )
         AND u.status<>'DELETED'
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [accountNumber]
    );
  }

  private async matchPartnerClient(item: any) {
    const externalRef = this.clientRef(item);
    const accountNumber = this.accountNumber(item);

    if (externalRef) {
      const byRef = await this.db.one(
        `SELECT c.id
         FROM broker_partner_clients c
         JOIN brokers b ON b.id=c.broker_id
         WHERE b.code='EXNESS'
           AND c.status='VERIFIED'
           AND c.external_client_ref=$1
         LIMIT 1`,
        [externalRef]
      );
      if (byRef) return byRef;
    }

    if (accountNumber) {
      return this.db.one(
        `SELECT c.id
         FROM mt5_accounts a
         JOIN broker_partner_clients c ON c.user_id=a.user_id
         JOIN brokers b ON b.id=c.broker_id
         WHERE b.code='EXNESS'
           AND c.status='VERIFIED'
           AND a.account_number=$1
           AND (
             upper(trim(COALESCE(a.broker,''))) LIKE 'EXNESS%'
             OR upper(trim(COALESCE(a.broker_server,''))) LIKE 'EXNESS%'
           )
         LIMIT 1`,
        [accountNumber]
      );
    }

    return null;
  }

  private commissionEventId(item: any) {
    return this.text(item, [
      "external_event_id","externalEventId","event_id","eventId",
      "transaction_id","transactionId","reward_id","rewardId",
      "commission_id","commissionId","id"
    ]).slice(0,180);
  }

  private commissionCurrency(item: any) {
    return this.text(item, [
      "currency","reward_currency","rewardCurrency",
      "commission_currency","commissionCurrency"
    ]).toUpperCase().slice(0,8);
  }

  private commissionMinor(item: any, scale: number) {
    const explicitMinor = this.value(item, [
      "gross_commission_minor","grossCommissionMinor",
      "commission_minor","commissionMinor","amount_minor","amountMinor"
    ]);
    if (explicitMinor !== null) {
      const n = Math.trunc(Number(explicitMinor));
      return Number.isSafeInteger(n) && n > 0 ? n : 0;
    }

    const major = this.value(item, [
      "gross_commission","grossCommission","commission","reward",
      "partner_reward","partnerReward","commission_amount",
      "commissionAmount","amount"
    ]);
    const n = Number(major);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * scale);
  }

  private occurredAt(item: any) {
    const raw = this.value(item, [
      "occurred_at","occurredAt","created_at","createdAt",
      "datetime","date_time","dateTime","date","time"
    ]);
    if (raw === null) return "";
    const d = new Date(String(raw));
    return Number.isFinite(d.getTime()) ? d.toISOString() : "";
  }

  private symbol(item: any) {
    return this.text(item, ["symbol","instrument","instrument_name","instrumentName"])
      .toUpperCase().slice(0,64);
  }

  private volumeLots(item: any) {
    const raw = this.value(item, ["volume_lots","volumeLots","lots","volume"]);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  private async createRun(triggerType: TriggerType) {
    return this.db.one(
      `INSERT INTO broker_sync_runs(broker_code,trigger_type,status)
       VALUES('EXNESS',$1,'RUNNING')
       RETURNING id,started_at`,
      [triggerType]
    );
  }

  private async finishRun(
    id: string,
    status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED",
    counts: {
      clientsSeen: number;
      clientsVerified: number;
      commissionsSeen: number;
      commissionsImported: number;
      rebatesReleased: number;
    },
    errorDetail = "",
    metadata: Record<string,unknown> = {}
  ) {
    await this.db.query(
      `UPDATE broker_sync_runs SET
         status=$2,
         completed_at=now(),
         clients_seen=$3,
         clients_verified=$4,
         commissions_seen=$5,
         commissions_imported=$6,
         rebates_released=$7,
         error_detail=$8,
         metadata=$9::jsonb
       WHERE id=$1`,
      [
        id,status,
        counts.clientsSeen,counts.clientsVerified,
        counts.commissionsSeen,counts.commissionsImported,
        counts.rebatesReleased,
        errorDetail.slice(0,2000),
        JSON.stringify(metadata)
      ]
    );
  }

  async runSync(triggerType: TriggerType = "MANUAL") {
    const state = await this.api.state();
    const lockToken = randomUUID();
    const lock = await this.db.one(
      `UPDATE broker_api_connections SET
         sync_lock_token=$2,
         sync_lock_until=now()+interval '10 minutes',
         updated_at=now()
       WHERE broker_code=$1
         AND (sync_lock_until IS NULL OR sync_lock_until<=now())
       RETURNING broker_code`,
      ["EXNESS", lockToken]
    );
    if (!lock) {
      return {
        ok: true,
        status: "SKIPPED",
        reason: "SYNC_ALREADY_RUNNING",
        counts: {
          clientsSeen: 0,
          clientsVerified: 0,
          commissionsSeen: 0,
          commissionsImported: 0,
          rebatesReleased: 0
        }
      };
    }

    const run = await this.createRun(triggerType);
    const counts = {
      clientsSeen: 0,
      clientsVerified: 0,
      commissionsSeen: 0,
      commissionsImported: 0,
      rebatesReleased: 0
    };
    const errors: string[] = [];

    if (triggerType === "SCHEDULED" && !state.enabled) {
      await this.finishRun(run.id,"SKIPPED",counts,"Automation disabled");
      return { ok: true, status: "SKIPPED", counts };
    }

    try {
      const token = await this.api.authenticate();
      await this.api.request("/api/partner/summary/", token);
      const reports = await this.api.rawReports(token);
      counts.clientsSeen = reports.clients.length;
      counts.commissionsSeen = reports.commissions.length;

      if (state.autoVerifyClients && state.clientReportPath) {
        for (const item of reports.clients) {
          try {
            const accountNumber = this.accountNumber(item);
            const externalRef = this.clientRef(item);
            const user = await this.matchUserByAccount(accountNumber);
            if (!user?.id) continue;
            const verified = await this.benefits.verifyClientFromApi(
              String(user.id),
              externalRef,
              "EXNESS_API"
            );
            if (verified?.id) counts.clientsVerified += 1;
          } catch (error: any) {
            errors.push("client: " + String(error?.message || error).slice(0,200));
          }
        }
      }

      if (state.autoImportCommissions && state.commissionReportPath) {
        for (const item of reports.commissions) {
          try {
            const partnerClient = await this.matchPartnerClient(item);
            if (!partnerClient?.id) continue;

            const eventId = this.commissionEventId(item);
            const currency = this.commissionCurrency(item);
            const grossCommissionMinor = this.commissionMinor(
              item,
              Number(reports.commissionAmountScale || 100)
            );
            const occurredAt = this.occurredAt(item);

            if (!eventId || !currency || !grossCommissionMinor || !occurredAt) {
              errors.push("commission: missing canonical fields");
              continue;
            }

            try {
              const result = await this.finance.recordCommission(
                {
                  partnerClientId: String(partnerClient.id),
                  externalEventId: eventId,
                  symbol: this.symbol(item) || undefined,
                  volumeLots: this.volumeLots(item),
                  grossCommissionMinor,
                  currency,
                  occurredAt,
                  rawReference: JSON.stringify({
                    source: "EXNESS_API",
                    eventId,
                    externalClientRef: this.clientRef(item) || null,
                    accountLast4: this.accountNumber(item).slice(-4) || null,
                    symbol: this.symbol(item) || null
                  })
                },
                "EXNESS_API"
              );
              counts.commissionsImported += 1;

              if (state.autoReleaseRebates && result.rebateEntryId) {
                await this.finance.releaseRebate(
                  String(result.rebateEntryId),
                  "EXNESS_API"
                );
                counts.rebatesReleased += 1;
              }
            } catch (error: any) {
              const message = String(error?.message || error);
              if (!message.includes("ถูกบันทึกแล้ว")) {
                errors.push("commission: " + message.slice(0,200));
              }
            }
          } catch (error: any) {
            errors.push("commission: " + String(error?.message || error).slice(0,200));
          }
        }
      }

      const status = errors.length ? "PARTIAL" : "SUCCESS";
      await this.finishRun(
        run.id,
        status,
        counts,
        errors.slice(0,8).join(" | "),
        {
          clientReportConfigured: Boolean(state.clientReportPath),
          commissionReportConfigured: Boolean(state.commissionReportPath)
        }
      );

      await this.db.query(
        `UPDATE broker_api_connections SET
           last_sync_at=now(),
           next_sync_at=CASE WHEN enabled THEN now()+make_interval(mins=>sync_interval_minutes) ELSE NULL END,
           updated_at=now()
         WHERE broker_code='EXNESS'`
      );

      return { ok: true, status, counts, errors: errors.slice(0,8) };
    } catch (error: any) {
      const detail = String(error?.message || error || "Sync failed");
      await this.finishRun(run.id,"FAILED",counts,detail);
      await this.db.query(
        `UPDATE broker_api_connections SET
           last_sync_at=now(),
           next_sync_at=CASE WHEN enabled THEN now()+make_interval(mins=>sync_interval_minutes) ELSE NULL END,
           updated_at=now()
         WHERE broker_code='EXNESS'`
      );
      return { ok: false, status: "FAILED", counts, error: detail };
    } finally {
      await this.db.query(
        `UPDATE broker_api_connections SET
           sync_lock_token=NULL,
           sync_lock_until=NULL,
           updated_at=now()
         WHERE broker_code='EXNESS' AND sync_lock_token=$1`,
        [lockToken]
      ).catch(() => {});
    }
  }

  async runDue() {
    await this.api.state();

    const claimed = await this.db.one(
      `UPDATE broker_api_connections SET
         next_sync_at=now()+make_interval(mins=>sync_interval_minutes),
         updated_at=now()
       WHERE broker_code='EXNESS'
         AND enabled=true
         AND last_test_status='PASS'
         AND (next_sync_at IS NULL OR next_sync_at<=now())
       RETURNING broker_code`
    );
    if (!claimed) return { ok: true, due: false };
    return this.runSync("SCHEDULED");
  }

  async recentRuns() {
    await this.api.state();
    const result = await this.db.query(
      `SELECT id,trigger_type,status,started_at,completed_at,
              clients_seen,clients_verified,commissions_seen,
              commissions_imported,rebates_released,error_detail,metadata
       FROM broker_sync_runs
       WHERE broker_code='EXNESS'
       ORDER BY started_at DESC
       LIMIT 30`
    );
    return result.rows;
  }
}
