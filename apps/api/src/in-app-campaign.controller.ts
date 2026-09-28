import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "./security";
import { InAppCampaignService } from "./in-app-campaign.service";

@Controller("in-app-campaigns")
@UseGuards(JwtGuard)
export class InAppCampaignController {
  constructor(private readonly campaigns: InAppCampaignService) {}

  @Get("active")
  active(@Req() req: any, @Query("path") path = "/") {
    return this.campaigns.active(
      String(req.user?.sub || ""),
      String(req.user?.role || ""),
      path
    );
  }

  @Post(":id/event")
  event(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.campaigns.record(String(req.user?.sub || ""), id, body || {});
  }
}
