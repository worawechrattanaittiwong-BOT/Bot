import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard, JwtGuard } from "../security";
import { BrokerService } from "./broker.service";

@Controller("brokers")
@UseGuards(JwtGuard)
export class BrokerController {
  constructor(private readonly brokers: BrokerService) {}

  @Get("exness")
  async exness(@Req() req: any) {
    return this.brokers.exnessSummary(String(req.user.sub || ""));
  }

  @Post("exness/registration-link")
  async registrationLink(
    @Req() req: any,
    @Body() body: { platform?: "WEB" | "MOBILE" | string }
  ) {
    return this.brokers.registrationLink(
      String(req.user.sub || ""),
      body?.platform
    );
  }
}

@Controller("admin/brokers")
@UseGuards(AdminGuard)
export class AdminBrokerController {
  constructor(private readonly brokers: BrokerService) {}

  @Get("exness/settings")
  async exnessSettings() {
    return this.brokers.adminExnessSettings();
  }

  @Put("exness/settings")
  async saveExnessSettings(
    @Req() req: any,
    @Body() body: {
      active?: boolean;
      partnerCode?: string;
      webPartnerLink?: string;
      mobilePartnerLink?: string;
    }
  ) {
    const actor = req.user?.sub
      ? "ADMIN:" + String(req.user.sub)
      : "EMERGENCY_ADMIN";
    return this.brokers.saveAdminExnessSettings(body || {}, actor);
  }
}
