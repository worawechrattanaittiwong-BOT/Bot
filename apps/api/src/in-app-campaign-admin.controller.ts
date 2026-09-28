import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./security";
import { InAppCampaignService } from "./in-app-campaign.service";

@Controller("admin/in-app-campaigns")
@UseGuards(AdminGuard)
export class InAppCampaignAdminController {
  constructor(private readonly campaigns: InAppCampaignService) {}

  @Get()
  list() {
    return this.campaigns.adminList();
  }

  @Post(":id/status")
  setStatus(@Param("id") id: string, @Body() body: { status?: string }) {
    return this.campaigns.adminSetStatus(id, body?.status);
  }
}
