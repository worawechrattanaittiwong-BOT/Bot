import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import { createReadStream } from "node:fs";
import { AdminGuard, WorkerGuard } from "./security";
import { CloudUpdateService } from "./cloud-update.service";

@Controller("admin/cloud-updates")
@UseGuards(AdminGuard)
export class CloudUpdateAdminController {
  constructor(private readonly updates: CloudUpdateService) {}

  @Get()
  list() {
    return this.updates.list();
  }

  @Post()
  create(
    @Req() req: any,
    @Body() body: { runnerId: string }
  ) {
    const actor = req.user?.sub
      ? "OWNER:" + String(req.user.sub)
      : "ADMIN_KEY";
    return this.updates.createFleetUpdate(String(body.runnerId || ""), actor);
  }

  @Post(":id/rollback")
  rollback(@Req() req: any, @Param("id") id: string) {
    const actor = req.user?.sub
      ? "OWNER:" + String(req.user.sub)
      : "ADMIN_KEY";
    return this.updates.rollback(id, actor);
  }
}

@Controller("worker/updates")
@UseGuards(WorkerGuard)
export class CloudUpdateWorkerController {
  constructor(private readonly updates: CloudUpdateService) {}

  @Post("next")
  next(@Body() body: { runnerId: string }) {
    return this.updates.next(String(body.runnerId || ""));
  }

  @Post("result")
  result(@Body() body: {
    runnerId: string;
    instanceUpdateId: string;
    result: "APPLIED" | "FAILED";
    resultCode?: string;
    previousSha256?: string;
  }) {
    return this.updates.result(String(body.runnerId || ""), body);
  }

  @Post("artifact")
  @Header("Content-Type", "application/octet-stream")
  @Header("Content-Disposition", 'attachment; filename="FastBasketBot.ex5"')
  async artifact(
    @Body() body: { runnerId: string; instanceUpdateId: string },
    @Res({ passthrough: true }) res: any
  ) {
    const path = await this.updates.artifact(
      String(body.runnerId || ""),
      String(body.instanceUpdateId || "")
    );
    return new StreamableFile(createReadStream(path));
  }
}
