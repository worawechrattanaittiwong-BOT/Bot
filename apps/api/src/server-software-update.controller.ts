import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AdminGuard, WorkerGuard } from "./security";
import { ServerSoftwareUpdateService } from "./server-software-update.service";

@Controller("admin/cloud-server-updates")
@UseGuards(AdminGuard)
export class ServerSoftwareUpdateAdminController {
  constructor(private readonly updates: ServerSoftwareUpdateService) {}

  @Post()
  create(@Req() req: any, @Body() body: { runnerId: string }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    return this.updates.create(String(body.runnerId || ""), actor);
  }
}

@Controller("worker/server-updates")
@UseGuards(WorkerGuard)
export class ServerSoftwareUpdateWorkerController {
  constructor(private readonly updates: ServerSoftwareUpdateService) {}

  @Post("next")
  next(@Body() body: { runnerId: string }) {
    return this.updates.next(String(body.runnerId || ""));
  }

  @Post("result")
  result(@Body() body: {
    runnerId: string;
    serverUpdateId: string;
    result: "RESTARTING" | "FAILED";
    resultCode?: string;
  }) {
    return this.updates.result(String(body.runnerId || ""), body);
  }
}
