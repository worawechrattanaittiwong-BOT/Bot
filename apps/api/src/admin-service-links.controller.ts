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
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { AdminGuard } from "./security";

type ServiceLinkInput = {
  name?: string;
  purpose?: string;
  url?: string;
  note?: string;
};

@Controller("admin/service-links")
@UseGuards(AdminGuard)
export class AdminServiceLinksController {
  private tableReady = false;

  constructor(private readonly db: DbService) {}

  private async ensureTable() {
    if (this.tableReady) return;

    const existing = await this.db.one<{ table_name: string | null }>(
      "SELECT to_regclass('public.admin_service_links') AS table_name"
    );

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS admin_service_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        purpose varchar(220) NOT NULL DEFAULT '',
        url text NOT NULL,
        note text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_service_links_name
        ON admin_service_links(lower(name));
      CREATE INDEX IF NOT EXISTS idx_admin_service_links_updated
        ON admin_service_links(updated_at DESC);
    `);

    if (!existing?.table_name) {
      await this.db.query(
        `INSERT INTO admin_service_links(name,purpose,url,note)
         VALUES
           ('Hostinger','VPS / Server / Domain','https://hpanel.hostinger.com/','Production server และ domain'),
           ('Resend','Email API','https://resend.com/','Email verification / OTP / password reset'),
           ('ThaiBulkSMS','SMS / OTP API','https://www.thaibulksms.com/','SMS และ OTP สำหรับระบบ'),
           ('Opn / Omise','Payment API','https://dashboard.omise.co/','PromptPay / payment / webhook'),
           ('GitHub','Source / CI / Build','https://github.com/SCENOVA-SNV/Bot','Repository และ GitHub Actions'),
           ('Let''s Encrypt','SSL Certificate','https://letsencrypt.org/','HTTPS certificate ผ่าน Certbot')
         ON CONFLICT DO NOTHING`
      );
    }

    this.tableReady = true;
  }

  private clean(body: ServiceLinkInput, partial = false) {
    const value = {
      name: String(body?.name ?? "").trim(),
      purpose: String(body?.purpose ?? "").trim(),
      url: String(body?.url ?? "").trim(),
      note: String(body?.note ?? "").trim()
    };

    if (!partial || body.name !== undefined) {
      if (!value.name || value.name.length > 120) {
        throw new BadRequestException("ชื่อบริการต้องมี 1-120 ตัวอักษร");
      }
    }
    if (!partial || body.purpose !== undefined) {
      if (value.purpose.length > 220) {
        throw new BadRequestException("รายละเอียดการใช้งานยาวเกินไป");
      }
    }
    if (!partial || body.note !== undefined) {
      if (value.note.length > 1000) {
        throw new BadRequestException("หมายเหตุยาวเกินไป");
      }
    }
    if (!partial || body.url !== undefined) {
      if (!value.url) throw new BadRequestException("กรุณาใส่ลิงก์");
      try {
        const parsed = new URL(value.url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new Error("invalid protocol");
        }
      } catch {
        throw new BadRequestException("ลิงก์ต้องเป็น http:// หรือ https://");
      }
    }

    return value;
  }

  private assertId(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException("invalid service link id");
    }
  }

  @Get()
  async list() {
    await this.ensureTable();
    const result = await this.db.query(
      `SELECT id,name,purpose,url,note,created_at,updated_at
       FROM admin_service_links
       ORDER BY lower(name),created_at`
    );
    return { items: result.rows };
  }

  @Post()
  async create(@Body() body: ServiceLinkInput) {
    await this.ensureTable();
    const input = this.clean(body);
    try {
      const row = await this.db.one(
        `INSERT INTO admin_service_links(name,purpose,url,note)
         VALUES($1,$2,$3,$4)
         RETURNING id,name,purpose,url,note,created_at,updated_at`,
        [input.name, input.purpose, input.url, input.note]
      );
      return row;
    } catch (error: any) {
      if (error?.code === "23505") {
        throw new BadRequestException("มีชื่อบริการนี้อยู่แล้ว");
      }
      throw error;
    }
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: ServiceLinkInput) {
    await this.ensureTable();
    this.assertId(id);

    const current = await this.db.one(
      "SELECT id,name,purpose,url,note FROM admin_service_links WHERE id=$1",
      [id]
    );
    if (!current) throw new NotFoundException("ไม่พบบริการ");

    const merged = this.clean({
      name: body.name ?? current.name,
      purpose: body.purpose ?? current.purpose,
      url: body.url ?? current.url,
      note: body.note ?? current.note
    });

    try {
      return await this.db.one(
        `UPDATE admin_service_links
         SET name=$2,purpose=$3,url=$4,note=$5,updated_at=now()
         WHERE id=$1
         RETURNING id,name,purpose,url,note,created_at,updated_at`,
        [id, merged.name, merged.purpose, merged.url, merged.note]
      );
    } catch (error: any) {
      if (error?.code === "23505") {
        throw new BadRequestException("มีชื่อบริการนี้อยู่แล้ว");
      }
      throw error;
    }
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.ensureTable();
    this.assertId(id);
    const result = await this.db.query(
      "DELETE FROM admin_service_links WHERE id=$1 RETURNING id",
      [id]
    );
    if (!result.rowCount) throw new NotFoundException("ไม่พบบริการ");
    return { ok: true };
  }
}
