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
import { AdminGuard, CryptoService } from "./security";
import { RuntimeSecretsService } from "./runtime-secrets.service";
import { ApiCredentialTesterService } from "./api-credential-tester.service";

type SaveCredentialBody = {
  configKey?: string;
  category?: string;
  label?: string;
  value?: string;
  note?: string;
  active?: boolean;
  provider?: string;
  testUrl?: string;
  authMode?: string;
  headerName?: string;
  testProof?: string;
};

type ProofEntry = {
  key: string;
  hash: string;
};

type TestProofPayload = {
  v: 1;
  exp: number;
  primaryKey: string;
  entries: ProofEntry[];
  provider: string;
  status: "PASS" | "LIMITED";
  detail: string;
  testUrl: string;
  authMode: string;
  headerName: string;
};

@Controller("admin/api-credentials")
@UseGuards(AdminGuard)
export class AdminApiCredentialsController {
  constructor(
    private readonly secrets: RuntimeSecretsService,
    private readonly tester: ApiCredentialTesterService,
    private readonly crypto: CryptoService
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

  private issueProof(
    body: {
      configKey?: string;
      value?: string;
      companionConfigKey?: string;
      companionValue?: string;
      testUrl?: string;
      authMode?: string;
      headerName?: string;
    },
    result: any
  ) {
    if (!result?.ok || !["PASS", "LIMITED"].includes(String(result.status))) return null;

    const primaryKey = this.secrets.normalizeKey(body.configKey || "SERVICE_API_KEY");
    const primaryValue = String(body.value || "").trim();
    const entries: ProofEntry[] = [{
      key: primaryKey,
      hash: this.crypto.sha256(primaryValue)
    }];

    const companionKeyRaw = String(body.companionConfigKey || "").trim();
    const companionValue = String(body.companionValue || "").trim();
    if (companionKeyRaw && companionValue) {
      entries.push({
        key: this.secrets.normalizeKey(companionKeyRaw),
        hash: this.crypto.sha256(companionValue)
      });
    }

    const payload: TestProofPayload = {
      v: 1,
      exp: Date.now() + 10 * 60 * 1000,
      primaryKey,
      entries,
      provider: String(result.provider || "").slice(0, 140),
      status: result.status === "LIMITED" ? "LIMITED" : "PASS",
      detail: (
        String(result.detail || "") +
        (result.detectedFrom ? " · Detected from: " + String(result.detectedFrom) : "")
      ).slice(0, 1000),
      testUrl: String(body.testUrl || "").trim().slice(0, 1200),
      authMode: String(body.authMode || "BEARER").trim().toUpperCase().slice(0, 32),
      headerName: String(body.headerName || "").trim().slice(0, 80)
    };

    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return encoded + "." + this.crypto.sign(encoded);
  }

  private parseProof(token: unknown): TestProofPayload {
    const raw = String(token || "").trim();
    const [encoded, signature, extra] = raw.split(".");
    if (!encoded || !signature || extra || !this.crypto.verifySignature(encoded, signature)) {
      throw new BadRequestException("Test proof ไม่ถูกต้อง กรุณา Test Connection ใหม่");
    }

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new BadRequestException("Test proof ไม่ถูกต้อง");
    }

    if (
      payload?.v !== 1 ||
      !Number.isFinite(Number(payload?.exp)) ||
      Number(payload.exp) < Date.now() ||
      !["PASS", "LIMITED"].includes(String(payload?.status)) ||
      !Array.isArray(payload?.entries)
    ) {
      throw new BadRequestException("Test proof หมดอายุหรือใช้ไม่ได้ กรุณา Test Connection ใหม่");
    }
    return payload as TestProofPayload;
  }

  private async verifySaveProof(body: SaveCredentialBody, id?: string) {
    const proof = this.parseProof(body.testProof);
    const configKey = this.secrets.normalizeKey(body.configKey || "");
    let value = String(body.value || "").trim();

    if (!value && id) {
      const stored = await this.secrets.getForTest(id);
      if (!stored) throw new NotFoundException("ไม่พบ API Key");
      if (this.secrets.normalizeKey(stored.configKey) !== configKey) {
        throw new BadRequestException("Config Key เปลี่ยนแล้ว กรุณาใส่ Key และ Test ใหม่");
      }
      value = String(stored.value || "").trim();
    }

    if (!value) {
      throw new BadRequestException("ไม่พบ API Key ที่ผ่านการ Test");
    }

    const hash = this.crypto.sha256(value);
    const matched = proof.entries.some(entry =>
      entry.key === configKey && entry.hash === hash
    );
    if (!matched) {
      throw new BadRequestException("API Key มีการเปลี่ยนหลัง Test กรุณา Test Connection ใหม่");
    }

    if (configKey === proof.primaryKey) {
      const testUrl = String(body.testUrl || "").trim();
      const authMode = String(body.authMode || "BEARER").trim().toUpperCase();
      const headerName = String(body.headerName || "").trim();

      if (
        testUrl !== proof.testUrl ||
        authMode !== proof.authMode ||
        headerName !== proof.headerName
      ) {
        throw new BadRequestException("ค่า Test Connection เปลี่ยนแล้ว กรุณา Test ใหม่");
      }
    }

    return proof;
  }

  @Post("test")
  async test(
    @Body() body: {
      configKey?: string;
      category?: string;
      value?: string;
      companionConfigKey?: string;
      companionValue?: string;
      testUrl?: string;
      authMode?: string;
      headerName?: string;
    }
  ) {
    try {
      const result = await this.tester.test(body);
      return {
        ...result,
        testProof: this.issueProof(body, result)
      };
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
          key: "easyslip",
          name: "EasySlip",
          category: "PAYMENT",
          active: this.configured("EASYSLIP_API_KEY"),
          detail: "ตรวจสลิปธนาคาร / จับคู่บัญชี / ตรวจยอดและสลิปซ้ำ"
        },
        {
          key: "omise",
          name: "Opn / Omise",
          category: "PAYMENT",
          active: this.configured("OMISE_SECRET_KEY"),
          detail: "PromptPay / payment gateway"
        },
        {
          key: "omise-webhook",
          name: "Opn / Omise Webhook",
          category: "PAYMENT",
          active: this.configured("OMISE_WEBHOOK_SECRET"),
          detail: "HMAC-SHA256 webhook signature verification"
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
      const proof = await this.verifySaveProof(body);
      const row = await this.secrets.save({
        configKey: String(body.configKey || ""),
        category: String(body.category || "OTHER"),
        label: String(body.label || ""),
        value: String(body.value || ""),
        note: String(body.note || ""),
        active: body.active !== false,
        updatedBy: this.actor(req),
        provider: proof.provider,
        testUrl: String(body.testUrl || ""),
        authMode: String(body.authMode || "BEARER"),
        headerName: String(body.headerName || ""),
        lastTestStatus: proof.status,
        lastTestDetail: proof.detail
      });
      return { ok: true, id: row?.id };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
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
      const proof = await this.verifySaveProof(body, id);
      const row = await this.secrets.save({
        id,
        configKey: String(body.configKey || ""),
        category: String(body.category || "OTHER"),
        label: String(body.label || ""),
        value: body.value === undefined ? undefined : String(body.value || ""),
        note: String(body.note || ""),
        active: body.active !== false,
        updatedBy: this.actor(req),
        provider: proof.provider,
        testUrl: String(body.testUrl || ""),
        authMode: String(body.authMode || "BEARER"),
        headerName: String(body.headerName || ""),
        lastTestStatus: proof.status,
        lastTestDetail: proof.detail
      });
      if (!row) throw new Error("ไม่พบ API Key");
      return { ok: true };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new BadRequestException(String(error?.message || "แก้ไข API Key ไม่สำเร็จ"));
    }
  }

  @Post(":id/test-saved")
  async testSaved(
    @Param("id") id: string,
    @Body() body: {
      testUrl?: string;
      authMode?: string;
      headerName?: string;
    }
  ) {
    this.assertId(id);
    try {
      const stored = await this.secrets.getForTest(id);
      if (!stored) throw new Error("ไม่พบ API Key");
      const request = {
        configKey: stored.configKey,
        category: stored.category,
        value: stored.value,
        testUrl: String(body.testUrl || stored.testUrl || ""),
        authMode: String(body.authMode || stored.authMode || "BEARER"),
        headerName: String(body.headerName || stored.headerName || "")
      };
      const result = await this.tester.test(request);
      await this.secrets.recordTest(id, result.status, result.detail, result.provider);
      return {
        ...result,
        testProof: this.issueProof(request, result)
      };
    } catch (error: any) {
      throw new BadRequestException(String(error?.message || "ทดสอบ API ไม่สำเร็จ"));
    }
  }

  @Patch(":id/active")
  async active(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { active?: boolean }
  ) {
    this.assertId(id);
    try {
      const row = await this.secrets.setActive(id, Boolean(body.active), this.actor(req));
      if (!row) throw new NotFoundException("ไม่พบ API Key");
      return { ok: true };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(String(error?.message || "เปลี่ยนสถานะ API Key ไม่สำเร็จ"));
    }
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    this.assertId(id);
    const row = await this.secrets.remove(id);
    if (!row) throw new NotFoundException("ไม่พบ API Key");
    return { ok: true };
  }
}
