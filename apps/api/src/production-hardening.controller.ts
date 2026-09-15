import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./security";
import { ProductionHardeningService } from "./production-hardening.service";

@Controller("admin/production-hardening")
@UseGuards(AdminGuard)
export class ProductionHardeningController {
  constructor(private readonly hardening: ProductionHardeningService) {}

  private actor(req: any) {
    return String(req.user?.email || req.user?.sub || "ADMIN").slice(0, 120);
  }

  @Get()
  snapshot() {
    return this.hardening.snapshot();
  }

  @Post("controls")
  updateControls(
    @Req() req: any,
    @Body() body: { cloudProvisioningPaused: boolean; cloudRecoveryPaused: boolean; reason?: string }
  ) {
    return this.hardening.updateControls(this.actor(req), body);
  }

  @Post("nodes/:runnerId/quarantine")
  quarantine(
    @Req() req: any,
    @Param("runnerId") runnerId: string,
    @Body() body: { quarantined: boolean; reason?: string }
  ) {
    return this.hardening.quarantineNode(this.actor(req), runnerId, body.quarantined === true, body.reason);
  }

  @Post("instances/:instanceId/recovery-reset")
  resetRecovery(@Req() req: any, @Param("instanceId") instanceId: string) {
    return this.hardening.resetRecovery(this.actor(req), instanceId);
  }
}
