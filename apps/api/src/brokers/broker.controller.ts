import {
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
import { BrokerService } from "./broker.service";
import { BrokerBenefitService } from "./broker-benefit.service";

@Controller("public/brokers")
export class PublicBrokerController {
  constructor(private readonly brokers: BrokerService) {}

  @Get("exness/signup")
  async exnessSignup(@Query("platform") platform = "WEB") {
    return this.brokers.publicRegistrationInfo(platform);
  }
}

@Controller("brokers")
@UseGuards(JwtGuard)
export class BrokerController {
  constructor(
    private readonly brokers: BrokerService,
    private readonly benefits: BrokerBenefitService
  ) {}

  @Get("exness/signup")
  async exnessSignup() {
    return this.brokers.registrationInfo();
  }

  @Get("exness")
  async exness(@Req() req: any) {
    const userId = String(req.user.sub || "");
    const [base, partner] = await Promise.all([
      this.brokers.exnessSummary(userId),
      this.benefits.userSummary(userId)
    ]);
    return { ...base, partner, phase: { ...base.phase, current: 3, partnerVerificationEnabled: true, benefitsEnabled: true, rebateEnabled: true } };
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
  constructor(
    private readonly brokers: BrokerService,
    private readonly benefits: BrokerBenefitService
  ) {}


  @Get("exness/clients")
  async exnessClients(@Query("q") q = "") {
    return this.benefits.adminClients(q);
  }

  @Put("exness/clients/:userId")
  async saveExnessClient(
    @Req() req: any,
    @Param("userId") userId: string,
    @Body() body: {
      status?: string;
      benefitLevel?: string;
      externalClientRef?: string;
      note?: string;
    }
  ) {
    const actor = req.user?.sub
      ? "ADMIN:" + String(req.user.sub)
      : "EMERGENCY_ADMIN";

    return this.benefits.setClient(
      {
        userId,
        status: body?.status,
        benefitLevel: body?.benefitLevel,
        externalClientRef: body?.externalClientRef,
        note: body?.note
      },
      actor
    );
  }


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
      benefitMessage?: string;
    }
  ) {
    const actor = req.user?.sub
      ? "ADMIN:" + String(req.user.sub)
      : "EMERGENCY_ADMIN";
    return this.brokers.saveAdminExnessSettings(body || {}, actor);
  }
}
