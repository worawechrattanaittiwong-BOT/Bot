import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard } from "./security";
import { ServerEnrollmentService } from "./server-enrollment.service";

function validRunnerId(value: unknown) {
  return /^[a-zA-Z0-9_-]{3,80}$/.test(String(value || ""));
}

@Controller("admin/cloud-servers")
@UseGuards(AdminGuard)
export class CloudServerAdminController {
  constructor(private readonly enrollment: ServerEnrollmentService) {}

  @Post()
  async createServer(
    @Req() req: any,
    @Body() body: {
      runnerId: string;
      region: string;
      capacity: number;
      monthlyCost: number;
      spec: string;
    }
  ) {
    if (!validRunnerId(body.runnerId)) {
      throw new BadRequestException("Runner ID ใช้ a-z, 0-9, - หรือ _ ความยาว 3–80 ตัว");
    }
    if (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 200) {
      throw new BadRequestException("Capacity ต้องเป็น 1–200");
    }
    if (!Number.isInteger(body.monthlyCost) || body.monthlyCost < 0 || body.monthlyCost > 1_000_000) {
      throw new BadRequestException("Invalid monthly cost");
    }

    const actor = req.user?.sub
      ? "OWNER:" + String(req.user.sub)
      : "ADMIN_KEY";

    return this.enrollment.createServer({
      runnerId: body.runnerId,
      region: String(body.region || "Thailand"),
      capacity: body.capacity,
      monthlyCost: body.monthlyCost,
      spec: String(body.spec || "")
    }, actor);
  }

  @Post(":id/enrollment")
  async renewEnrollment(@Req() req: any, @Param("id") id: string) {
    if (!validRunnerId(id)) throw new BadRequestException("Invalid Runner ID");
    const actor = req.user?.sub
      ? "OWNER:" + String(req.user.sub)
      : "ADMIN_KEY";
    return this.enrollment.renewEnrollment(id, actor);
  }
}

@Controller("server-enrollment")
export class ServerEnrollmentController {
  constructor(private readonly enrollment: ServerEnrollmentService) {}

  @Post("activate")
  async activate(@Body() body: {
    runnerId: string;
    enrollmentToken: string;
    hostname?: string;
  }) {
    if (!validRunnerId(body.runnerId)) throw new BadRequestException("Invalid Runner ID");
    const token = String(body.enrollmentToken || "").trim();
    if (token.length < 32 || token.length > 200) {
      throw new BadRequestException("Invalid enrollment token");
    }
    return this.enrollment.activate(body.runnerId, token, body.hostname);
  }
}
