import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard } from "./security";
import { RuntimeSecretsService } from "./runtime-secrets.service";
import { ApiCredentialTesterService } from "./api-credential-tester.service";

type SaveCredentialBody = {
  configKey?: string;
  category?: string;
  label?: string;
  value?: string;
  note?: string;
  active?: boolean;
};

@Controller("admin/api-credentials")
@UseGuards(AdminGuard)
export class AdminApiCredentialsController {
  constructor(
    private readonly secrets: RuntimeSecretsService,
    private readonly tester: ApiCredentialTesterService
  ) {}

  private assertId(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new BadRequestException("invalid credential id");
    }
  }

  private actor(req: any) {
    return String(req?.user?.code || req?.user?.sub || "ADMIN").slice(0, 160);
  }

  private configured(...keys: string[]) {
    return keys.every(key => Boolean(String(process.env[key] || "").trim()));
  }

  @Post("test")
  async test(
    @Body() body: {
      configKey?: string;
      category?: string;
      value?: string;
      testUrl?: string;
      authMode?: string;
      headerName?: string;
    }
  ) {
    try {
      return await this.tester.test(body);
    } catch (error: any) {
      throw new BadRequestException(String(error?.message || "ทดสอบ API ไม่สำเร็จ"));
    }
  }

  @Get()
  async list() {
    const items = await this.secrets.list();
    const activeByCategory = new Set(
      items.filter((item: any) => item.active).map((item: any) => String(item.category))
    );

    return {
      items,
      connections: [
        {
          key: "resend",
          name: "Resend",
          category: "EMAIL",
          active: this.configured("RESEND_API_KEY", "EMAIL_FROM"),
          detail: "Email OTP / verification / password reset"
        },
        {
          key: "thaibulksms-otp",
          name: "ThaiBulkSMS OTP",
          category: "SMS",
          active: this.configured("THAIBULKSMS_OTP_KEY", "THAIBULKSMS_OTP_SECRET"),
          detail: "OTP verification"
        },
        {
          key: "thaibulksms-sms",
          name: "ThaiBulkSMS SMS",
          category: "SMS",
          active: this.configured("THAIBULKSMS_API_KEY", "THAIBULKSMS_API_SECRET", "THAIBULKSMS_SENDER"),
          detail: "SMS fallback / notifications"
        },
        {
          key: "omise",
          name: "Opn / Omise",
          category: "PAYMENT",
          active: this.configured("OMISE_SECRET_KEY"),
          detail: "PromptPay / payment gateway"
        },
        {
          key: "ai",
          name: "AI Provider",
          category: "AI",
          active: activeByCategory.has("AI"),
          detail: "AI analysis / assistant services"
        },
        {
          key: "news",
          name: "News Provider",
          category: "NEWS",
          active: activeByCategory.has("NEWS"),
          detail: "Market / economic news"
        },
        {
          key: "market-data",
          name: "Market Data",
          category: "MARKET_DATA",
          active: activeByCategory.has("MARKET_DATA"),
          detail: "Chart / quote / market data"
        }
      ]
    };
  }

  @Post()
  async create(@Req() req: any, @Body() body: SaveCredentialBody) {
    try {
      const row = await this.secrets.save({
        configKey: String(body.configKey || ""),
        category: String(body.category || "OTHER"),
        label: String(body.label || ""),
        value: String(body.value || ""),
        note: String(body.note || ""),
        active: body.active !== false,
        updatedBy: this.actor(req)
      });
      return { ok: true, id: row?.id };
    } catch (error: any) {
      throw new BadRequestException(String(error?.message || "บันทึก API Key ไม่สำเร็จ"));
    }
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: SaveCredentialBody
  ) {
    this.assertId(id);
    try {
      const row = await this.secrets.save({
        id,
        configKey: String(body.configKey || ""),
        category: String(body.category || "OTHER"),
        label: String(body.label || ""),
        value: body.value === undefined ? undefined : String(body.value || ""),
        note: String(body.note || ""),
        active: body.active !== false,
        updatedBy: this.actor(req)
      });
      if (!row) throw new Error("ไม่พบ API Key");
      return { ok: true };
    } catch (error: any) {
      throw new BadRequestException(String(error?.message || "แก้ไข API Key ไม่สำเร็จ"));
    }
  }

  @Patch(":id/active")
  async active(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { active?: boolean }
  ) {
    this.assertId(id);
    const row = await this.secrets.setActive(id, Boolean(body.active), this.actor(req));
    if (!row) throw new NotFoundException("ไม่พบ API Key");
    return { ok: true };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    this.assertId(id);
    const row = await this.secrets.remove(id);
    if (!row) throw new NotFoundException("ไม่พบ API Key");
    return { ok: true };
  }
}
