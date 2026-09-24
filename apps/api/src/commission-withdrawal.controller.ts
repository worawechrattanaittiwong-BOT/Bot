import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard, JwtGuard, PayoutWorkerGuard } from "./security";
import { CommissionWithdrawalService } from "./commission-withdrawal.service";

function clientIp(req: any) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
}

function clientDeviceId(req: any) {
  return String(req?.headers?.["x-scenova-device-id"] || "").trim().slice(0, 180) || null;
}

function assertUuid(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) {
    throw new BadRequestException("invalid id");
  }
}

@Controller("commission-wallet")
@UseGuards(JwtGuard)
export class CommissionWalletWithdrawalController {
  constructor(private readonly withdrawals: CommissionWithdrawalService) {}

  @Get("withdrawals")
  async state(@Req() req: any) {
    return this.withdrawals.customerState(String(req.user.sub || ""));
  }

  @Post("destination")
  async destination(
    @Req() req: any,
    @Body() body: {
      bankCode?: string;
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      currentPassword?: string;
      twoFactorCode?: string;
    }
  ) {
    return this.withdrawals.saveDestination(
      String(req.user.sub || ""),
      body,
      clientIp(req)
    );
  }

  @Post("withdrawals")
  async request(
    @Req() req: any,
    @Body() body: {
      destinationId?: string;
      amountSatang?: number;
      clientRequestKey?: string;
      currentPassword?: string;
      twoFactorCode?: string;
    }
  ) {
    return this.withdrawals.requestWithdrawal(
      String(req.user.sub || ""),
      body,
      clientIp(req),
      clientDeviceId(req)
    );
  }

  @Post("withdrawals/:id/cancel")
  async cancel(@Req() req: any, @Param("id") id: string) {
    assertUuid(id);
    return this.withdrawals.cancelWithdrawal(
      String(req.user.sub || ""),
      id,
      clientIp(req)
    );
  }
}

@Controller("admin/commission-withdrawals")
@UseGuards(AdminGuard)
export class AdminCommissionWithdrawalsController {
  constructor(private readonly withdrawals: CommissionWithdrawalService) {}

  private actor(req: any) {
    return String(req?.user?.code || req?.user?.sub || "EMERGENCY_ADMIN").slice(0, 160);
  }

  private adminUserId(req: any) {
    const id = String(req?.user?.sub || "");
    if (!id) throw new BadRequestException("Admin session with 2FA is required");
    return id;
  }

  @Get()
  async dashboard() {
    return this.withdrawals.adminDashboard();
  }

  @Patch("settings")
  async settings(
    @Req() req: any,
    @Body() body: {
      requestsEnabled?: boolean;
      minAmountSatang?: number;
      maxAmountSatang?: number;
      destinationCooldownHours?: number;
    }
  ) {
    return this.withdrawals.updateSettings(this.actor(req), body);
  }

  @Post(":id/hold")
  async hold(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ) {
    assertUuid(id);
    return this.withdrawals.hold(id, this.actor(req), String(body.reason || ""), clientIp(req));
  }

  @Post(":id/approve")
  async approve(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ) {
    assertUuid(id);
    return this.withdrawals.approve(
      this.adminUserId(req),
      id,
      this.actor(req),
      String(body.reason || ""),
      clientIp(req)
    );
  }

  @Post(":id/reject")
  async reject(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ) {
    assertUuid(id);
    return this.withdrawals.reject(id, this.actor(req), String(body.reason || ""), clientIp(req));
  }

  @Post(":id/paid")
  async paid(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: {
      payoutReference?: string;
      currentPassword?: string;
      twoFactorCode?: string;
    }
  ) {
    assertUuid(id);
    return this.withdrawals.markPaid(
      this.adminUserId(req),
      id,
      this.actor(req),
      body,
      clientIp(req)
    );
  }

  @Post("destinations/:id/reveal")
  async reveal(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: {
      currentPassword?: string;
      twoFactorCode?: string;
    }
  ) {
    assertUuid(id);
    return this.withdrawals.revealDestination(
      this.adminUserId(req),
      id,
      this.actor(req),
      body,
      clientIp(req)
    );
  }

  @Patch("advanced-settings")
  async advancedSettings(
    @Req() req: any,
    @Body() body: {
      globalDailyLimitSatang?: number;
      dualApprovalThresholdSatang?: number;
      highRiskScoreThreshold?: number;
      criticalRiskScoreThreshold?: number;
      riskEngineEnabled?: boolean;
      autoPayoutEnabled?: boolean;
    }
  ) {
    return this.withdrawals.updateAdvancedSettings(this.actor(req), body);
  }

  @Post("kill-switch")
  async killSwitch(
    @Req() req: any,
    @Body() body: { enabled?: boolean; reason?: string }
  ) {
    return this.withdrawals.setKillSwitch(
      Boolean(body.enabled),
      this.actor(req),
      String(body.reason || "")
    );
  }

  @Patch("users/:userId/control")
  async userControl(
    @Req() req: any,
    @Param("userId") userId: string,
    @Body() body: {
      withdrawalPaused?: boolean;
      pauseReason?: string;
      dailyLimitSatang?: number | null;
    }
  ) {
    assertUuid(userId);
    return this.withdrawals.setUserControl(userId, this.actor(req), body);
  }

  @Post("alerts/:id/resolve")
  async resolveAlert(@Req() req: any, @Param("id") id: string) {
    assertUuid(id);
    return this.withdrawals.resolveAlert(id, this.actor(req));
  }
}

@Controller("payout-worker")
@UseGuards(PayoutWorkerGuard)
export class CommissionPayoutWorkerController {
  constructor(private readonly withdrawals: CommissionWithdrawalService) {}

  @Post("claim-next")
  async claim(@Body() body: { workerId?: string }) {
    return this.withdrawals.claimPayout(String(body.workerId || ""));
  }

  @Post("authorize")
  async authorize(@Body() body: { workerId?: string; jobId?: string }) {
    const jobId = String(body.jobId || "");
    assertUuid(jobId);
    return this.withdrawals.authorizePayout(String(body.workerId || ""), jobId);
  }

  @Post("result")
  async result(
    @Body() body: {
      workerId?: string;
      jobId?: string;
      status?: string;
      providerReference?: string;
      providerAmountSatang?: number;
      providerCurrency?: string;
      providerStatus?: string;
      errorCode?: string;
      errorMessage?: string;
    }
  ) {
    return this.withdrawals.reportPayoutResult(String(body.workerId || ""), body);
  }
}
