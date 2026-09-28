import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard } from "./security";
import { RuntimeSecretsService } from "./runtime-secrets.service";
import { EasySlipPaymentService } from "./easyslip-payment.service";

type PaymentQrMethod = "AUTO" | "PROMPTPAY_NATIONAL_ID" | "PROMPTPAY_PHONE";

@Controller("admin/payment-qr-settings")
@UseGuards(AdminGuard)
export class AdminPaymentQrSettingsController {
  constructor(
    private readonly secrets: RuntimeSecretsService,
    private readonly easyslip: EasySlipPaymentService
  ) {}

  private actor(req: any) {
    return String(req?.user?.code || req?.user?.sub || "ADMIN").slice(0, 160);
  }

  private digits(value: unknown) {
    return String(value || "").replace(/\D/g, "");
  }

  private methodFromEnv(): PaymentQrMethod {
    const qrType = String(process.env.EASYSLIP_QR_TYPE || "").trim().toUpperCase();
    const promptPayId = this.digits(process.env.EASYSLIP_PROMPTPAY_ID);
    if (qrType === "PROMPTPAY") {
      if (promptPayId.length === 13) return "PROMPTPAY_NATIONAL_ID";
      if (promptPayId.length === 10) return "PROMPTPAY_PHONE";
    }
    return "AUTO";
  }

  private mask(value: string) {
    if (!value) return "";
    if (value.length <= 4) return "•".repeat(value.length);
    return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4);
  }

  private validThaiNationalId(value: string) {
    if (!/^\d{13}$/.test(value)) return false;
    const sum = value
      .slice(0, 12)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (13 - index), 0);
    return (11 - (sum % 11)) % 10 === Number(value[12]);
  }

  private async snapshot() {
    const promptPayId = this.digits(process.env.EASYSLIP_PROMPTPAY_ID);
    const accounts = await this.easyslip.listBankAccounts().catch(() => []);
    return {
      method: this.methodFromEnv(),
      qrType: String(process.env.EASYSLIP_QR_TYPE || "").trim().toUpperCase() || "AUTO",
      promptPayIdMasked: this.mask(promptPayId),
      promptPayIdConfigured: Boolean(promptPayId),
      promptPayIdLength: promptPayId.length,
      easySlipConfigured: this.easyslip.configured(),
      accounts
    };
  }

  @Get()
  async get() {
    return this.snapshot();
  }

  @Post()
  async save(
    @Req() req: any,
    @Body() body: { method?: PaymentQrMethod; promptPayId?: string }
  ) {
    const method = String(body?.method || "").trim().toUpperCase() as PaymentQrMethod;
    if (!["AUTO", "PROMPTPAY_NATIONAL_ID", "PROMPTPAY_PHONE"].includes(method)) {
      throw new BadRequestException("วิธีสร้าง QR ไม่ถูกต้อง");
    }

    const incoming = this.digits(body?.promptPayId);
    const existing = this.digits(process.env.EASYSLIP_PROMPTPAY_ID);
    let promptPayId = incoming || existing;

    if (method === "PROMPTPAY_NATIONAL_ID") {
      if (!promptPayId) {
        throw new BadRequestException("กรุณาใส่เลขบัตรประชาชน 13 หลัก");
      }
      if (!this.validThaiNationalId(promptPayId)) {
        throw new BadRequestException("เลขบัตรประชาชน 13 หลักไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
      }
    }

    if (method === "PROMPTPAY_PHONE") {
      if (!/^0\d{9}$/.test(promptPayId)) {
        throw new BadRequestException("เบอร์ PromptPay ต้องเป็นเบอร์มือถือไทย 10 หลัก");
      }
    }

    const actor = this.actor(req);
    if (method !== "AUTO") {
      await this.secrets.save({
        configKey: "EASYSLIP_PROMPTPAY_ID",
        category: "PAYMENT",
        label: "PromptPay ID",
        value: promptPayId,
        note: method === "PROMPTPAY_NATIONAL_ID"
          ? "PromptPay เลขบัตรประชาชน 13 หลักสำหรับสร้าง QR ชำระเงิน"
          : "PromptPay เบอร์โทรศัพท์สำหรับสร้าง QR ชำระเงิน",
        active: true,
        updatedBy: actor,
        provider: "EasySlip / PromptPay",
        lastTestStatus: "LIMITED",
        lastTestDetail: "บันทึกผ่าน Payment QR Settings"
      });
    }

    await this.secrets.save({
      configKey: "EASYSLIP_QR_TYPE",
      category: "PAYMENT",
      label: "Payment QR Type",
      value: method === "AUTO" ? "AUTO" : "PROMPTPAY",
      note: method === "AUTO"
        ? "เลือก Merchant QR อัตโนมัติตามบัญชี EasySlip"
        : "สร้าง PromptPay QR จาก PromptPay ID ที่ตั้งไว้",
      active: true,
      updatedBy: actor,
      provider: "EasySlip / PromptPay",
      lastTestStatus: "LIMITED",
      lastTestDetail: "บันทึกผ่าน Payment QR Settings"
    });

    return {
      ok: true,
      ...(await this.snapshot())
    };
  }

  @Post("test-qr")
  async testQr() {
    const settings = await this.snapshot();
    if (!settings.easySlipConfigured) {
      throw new ConflictException("ยังไม่ได้เชื่อม EasySlip API");
    }
    if (settings.method !== "AUTO" && !settings.promptPayIdConfigured) {
      throw new ConflictException("ยังไม่ได้ตั้ง PromptPay ID");
    }

    const qr = await this.easyslip.createPaymentQr({
      orderId: "ADMINTEST" + Date.now(),
      amountSatang: 100
    });
    if (!qr?.dataUrl) {
      throw new ConflictException("สร้าง QR ทดสอบไม่สำเร็จ กรุณาตรวจการตั้งค่า EasySlip / PromptPay");
    }

    return {
      ok: true,
      amountSatang: 100,
      qrType: qr.type,
      dataUrl: qr.dataUrl,
      accounts: settings.accounts
    };
  }
}
