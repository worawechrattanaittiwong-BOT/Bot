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
import { AdminGuard, JwtGuard } from "./security";
import { CommissionWithdrawalService } from "./commission-withdrawal.service";

function clientIp(req: any) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
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
      clientIp(req)
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
    return this.withdrawals.approve(id, this.actor(req), String(body.reason || ""), clientIp(req));
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
}
