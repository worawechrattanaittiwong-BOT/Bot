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

  @Post()
  create(@Body() body: any) {
    return this.campaigns.adminCreate(body || {});
  }

  @Post(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.campaigns.adminUpdate(id, body || {});
  }

  @Post(":id/status")
  setStatus(@Param("id") id: string, @Body() body: { status?: string }) {
    return this.campaigns.adminSetStatus(id, body?.status);
  }

  @Post(":id/asset")
  uploadAsset(@Param("id") id: string, @Body() body: any) {
    return this.campaigns.adminUploadAsset(id, body || {});
  }

  @Post(":id/asset/remove")
  removeAsset(@Param("id") id: string, @Body() body: { assetKind?: string }) {
    return this.campaigns.adminRemoveAsset(id, body?.assetKind);
  }
}
