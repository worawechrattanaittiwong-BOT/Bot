import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard } from "../security";
import { BrokerAutomationService } from "./broker-automation.service";
import { ExnessPartnershipApiService } from "./exness-partnership-api.service";
import { ExnessAccountDetailsService } from "./exness-account-details.service";

function actor(req: any) {
  return req.user?.sub
    ? "ADMIN:" + String(req.user.sub)
    : "EMERGENCY_ADMIN";
}

@Controller("admin/brokers/exness/automation")
@UseGuards(AdminGuard)
export class AdminBrokerAutomationController {
  constructor(
    private readonly api: ExnessPartnershipApiService,
    private readonly automation: BrokerAutomationService,
    private readonly accountDetails: ExnessAccountDetailsService
  ) {}

  @Get()
  async state() {
    const [connection, runs] = await Promise.all([
      this.api.state(),
      this.automation.recentRuns()
    ]);
    return { connection, runs };
  }

  @Put("connection")
  async saveConnection(
    @Req() req: any,
    @Body() body: {
      email?: string;
      password?: string;
      enabled?: boolean;
      syncIntervalMinutes?: number;
      clientReportPath?: string;
      commissionReportPath?: string;
      autoVerifyClients?: boolean;
      autoImportCommissions?: boolean;
      autoReleaseRebates?: boolean;
      commissionAmountScale?: number;
      authIdentityField?: string;
    }
  ) {
    return this.api.saveConnection(body || {}, actor(req));
  }

  @Get("performance-preview")
  async performancePreview() {
    return this.api.performancePreview();
  }

  @Get("client-match-preview")
  async clientMatchPreview() {
    return this.automation.previewClientMatches();
  }

  // Admin only; per-MT5 partner membership and rebate configuration are read independently.
  @Get("client-account-details/:userId")
  async clientAccountDetails(@Param("userId") userId: string) {
    return this.accountDetails.forClient(userId);
  }

  @Post("connect")
  async connect(@Req() req: any, @Body() body: { email?: string; password?: string }) {
    return this.api.connect(body || {}, actor(req));
  }

  @Post("test")
  async test(@Req() req: any) {
    return this.api.testConnection(actor(req));
  }

  @Post("sync")
  async sync() {
    return this.automation.runSync("MANUAL");
  }
}
