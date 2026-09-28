import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { InAppCampaignService } from "./in-app-campaign.service";

@Controller("in-app-campaign-assets")
export class InAppCampaignAssetController {
  constructor(private readonly campaigns: InAppCampaignService) {}

  @Get(":id")
  async asset(@Param("id") id: string, @Res() res: Response) {
    const asset = await this.campaigns.asset(id);
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(asset.sizeBytes));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(asset.content);
  }
}
