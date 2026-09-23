import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtGuard } from "./security";
import { ReferralService } from "./referral.service";

@Controller("referrals")
@UseGuards(JwtGuard)
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  @Get()
  async dashboard(@Req() req: any) {
    const result = await this.referrals.dashboard(String(req.user.sub || ""));
    if (!result) throw new UnauthorizedException("account unavailable");
    return result;
  }
}
