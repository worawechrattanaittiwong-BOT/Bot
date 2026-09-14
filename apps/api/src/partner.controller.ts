import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "./security";
import { PartnerService } from "./partner.service";

@Controller("partner")
@UseGuards(JwtGuard)
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  @Get()
  async status(@Req() req: any) {
    return this.partner.summary(String(req.user.sub));
  }

  @Post("customers/activate")
  async activateCustomer(@Req() req: any, @Body() body: { target?: string }) {
    const userId = String(req.user.sub);
    return this.partner.activateCustomer(userId, String(body?.target || ""), "PARTNER:" + userId);
  }

  @Post("customers/renew")
  async renewCustomer(@Req() req: any, @Body() body: { customerUserId?: string }) {
    const userId = String(req.user.sub);
    return this.partner.renewCustomer(userId, String(body?.customerUserId || ""), "PARTNER:" + userId);
  }
}
