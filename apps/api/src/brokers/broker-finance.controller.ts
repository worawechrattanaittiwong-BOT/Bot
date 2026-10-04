import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard, JwtGuard } from "../security";
import { BrokerFinanceService } from "./broker-finance.service";

function actor(req: any) {
  return req.user?.sub
    ? "ADMIN:" + String(req.user.sub)
    : "EMERGENCY_ADMIN";
}

function uuid(value: string, label: string) {
  const input = String(value || "");
  if (!/^[0-9a-f-]{36}$/i.test(input)) {
    throw new BadRequestException(label + " ไม่ถูกต้อง");
  }
  return input;
}

@Controller("brokers/exness/rebates")
@UseGuards(JwtGuard)
export class BrokerRebateController {
  constructor(private readonly finance: BrokerFinanceService) {}

  @Get()
  async summary(@Req() req: any) {
    return this.finance.customerSummary(String(req.user.sub || ""));
  }
}

@Controller("admin/brokers/exness/finance")
@UseGuards(AdminGuard)
export class AdminBrokerFinanceController {
  constructor(private readonly finance: BrokerFinanceService) {}

  @Get()
  async dashboard(@Query("q") q = "") {
    return this.finance.adminDashboard(q);
  }

  @Put("rebate-policies/:levelCode")
  async rebatePolicy(
    @Req() req: any,
    @Param("levelCode") levelCode: string,
    @Body() body: { rebateBps?: number; active?: boolean }
  ) {
    return this.finance.updatePolicy(
      levelCode,
      body?.rebateBps,
      body?.active,
      actor(req)
    );
  }

  @Post("commissions")
  async recordCommission(
    @Req() req: any,
    @Body() body: {
      partnerClientId?: string;
      externalEventId?: string;
      symbol?: string;
      volumeLots?: number;
      grossCommissionMinor?: number;
      currency?: string;
      occurredAt?: string;
      rawReference?: string;
    }
  ) {
    return this.finance.recordCommission(body || {}, actor(req));
  }

  @Post("rebates/:id/release")
  async releaseRebate(@Req() req: any, @Param("id") id: string) {
    return this.finance.releaseRebate(
      uuid(id, "Rebate Entry ID"),
      actor(req)
    );
  }

  @Post("rebates/:id/paid")
  async paidRebate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { payoutReference?: string }
  ) {
    return this.finance.markRebatePaid(
      uuid(id, "Rebate Entry ID"),
      body?.payoutReference,
      actor(req)
    );
  }

  @Post("commissions/:id/reverse")
  async reverseCommission(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ) {
    return this.finance.reverseCommission(
      uuid(id, "Commission Event ID"),
      body?.reason,
      actor(req)
    );
  }
}
