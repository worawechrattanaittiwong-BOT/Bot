import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { JwtGuard } from "./security";
import { RuntimeMigrationService } from "./runtime-migration.service";

@Controller("runtime-migration")
@UseGuards(JwtGuard)
export class RuntimeMigrationController {
  constructor(private readonly migrations: RuntimeMigrationService) {}

  private actor(req: any) {
    return String(req?.user?.code || req?.user?.user_code || req?.user?.sub || "USER").slice(0, 160);
  }

  @Get("status")
  async status(@Req() req: any) {
    const userId = String(req.user.sub);
    const snapshot = await this.migrations.overview(userId);
    for (const migration of snapshot.migrations) {
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(String(migration.state))) continue;
      try {
        await this.migrations.reconcile(userId, String(migration.id), this.actor(req));
      } catch {
        // Status stays readable even when a transient Worker/DB reconciliation
        // check cannot advance the state. Explicit mutation endpoints still fail closed.
      }
    }
    return this.migrations.overview(userId);
  }

  @Post("owner/local-to-cloud")
  async ownerLocalToCloud(
    @Req() req: any,
    @Body() body: {
      sourceSlotId: string;
      tradingPassword?: string;
    }
  ) {
    return this.migrations.ownerLocalToCloud(
      String(req.user.sub),
      this.actor(req),
      {
        sourceSlotId: String(body.sourceSlotId || ""),
        tradingPassword: String(body.tradingPassword || "")
      }
    );
  }

  @Post("request")
  async request(
    @Req() req: any,
    @Body() body: {
      sourceSlotId: string;
      targetSlotId: string;
      tradingPassword?: string;
      runnerId?: string;
      confirmFlat?: boolean;
      confirmSwitch?: boolean;
    }
  ) {
    return this.migrations.request(String(req.user.sub), this.actor(req), body);
  }

  @Post(":id/reconcile")
  async reconcile(@Req() req: any, @Param("id") id: string) {
    return this.migrations.reconcile(String(req.user.sub), id, this.actor(req));
  }
}

@Controller("runtime-migration/agent")
export class RuntimeMigrationAgentController {
  constructor(private readonly migrations: RuntimeMigrationService) {}

  @Post("poll")
  async poll(@Body() body: { instanceId?: string; installToken?: string }) {
    return this.migrations.agentPoll(
      String(body.instanceId || "").trim(),
      String(body.installToken || "").trim()
    );
  }

  @Post("confirm")
  async confirm(
    @Body() body: {
      instanceId?: string;
      installToken?: string;
      migrationId?: string;
      executionGeneration?: number;
      result?: string;
      errorCode?: string;
    }
  ) {
    return this.migrations.confirmLocalStop(
      String(body.instanceId || "").trim(),
      String(body.installToken || "").trim(),
      String(body.migrationId || "").trim(),
      Number(body.executionGeneration || 0),
      String(body.result || "").trim().toUpperCase(),
      String(body.errorCode || "").trim()
    );
  }
}
