import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync
} from "fs";
import { basename, extname, join } from "path";
import { DbService } from "./db.service";

const MODE_KEYS = new Set(["AUTO","RACE","COUNTER","FLIP_LOCK","ZERO_GRID","MANUAL"]);
const VIDEO_TYPES: Record<string,string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm"
};
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

@Injectable()
export class ModeGuideVideoService implements OnModuleInit {
  private readonly mediaRoot =
    String(process.env.MODE_GUIDE_MEDIA_DIR || "").trim() ||
    "/data/scenova-mode-guide";

  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    mkdirSync(this.mediaRoot, { recursive: true });
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS mode_guide_videos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mode_key varchar(24) NOT NULL
          CHECK(mode_key IN ('AUTO','RACE','COUNTER','FLIP_LOCK','ZERO_GRID','MANUAL')),
        title varchar(180) NOT NULL,
        original_name varchar(240),
        storage_name varchar(120) NOT NULL UNIQUE,
        content_type varchar(64) NOT NULL,
        size_bytes bigint NOT NULL CHECK(size_bytes > 0),
        width integer NOT NULL CHECK(width > 0),
        height integer NOT NULL CHECK(height > 0),
        duration_seconds numeric(12,3),
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_by varchar(180),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_mode_guide_videos_mode_active
        ON mode_guide_videos(mode_key,is_active,sort_order,created_at);
    `);
  }

  private mode(value: unknown) {
    const mode = String(value || "").trim().toUpperCase();
    if (!MODE_KEYS.has(mode)) throw new BadRequestException("invalid trading mode");
    return mode;
  }

  private uuid(value: unknown) {
    const id = String(value || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException("invalid video id");
    }
    return id;
  }

  private row(row: any) {
    return {
      id: row.id,
      modeKey: row.mode_key,
      title: row.title,
      originalName: row.original_name || null,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes || 0),
      width: Number(row.width || 0),
      height: Number(row.height || 0),
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
      sortOrder: Number(row.sort_order || 0),
      isActive: row.is_active === true,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async activeList() {
    const rows = (await this.db.query(`
      SELECT id,mode_key,title,original_name,content_type,size_bytes,width,height,
             duration_seconds,sort_order,is_active,created_at,updated_at
      FROM mode_guide_videos
      WHERE is_active=true
      ORDER BY mode_key,sort_order,created_at
    `)).rows || [];
    return { videos: rows.map((row: any) => this.row(row)) };
  }

  async adminList() {
    const rows = (await this.db.query(`
      SELECT id,mode_key,title,original_name,content_type,size_bytes,width,height,
             duration_seconds,sort_order,is_active,created_at,updated_at
      FROM mode_guide_videos
      ORDER BY mode_key,sort_order,created_at
    `)).rows || [];
    return { videos: rows.map((row: any) => this.row(row)) };
  }

  private validateFileSignature(path: string, contentType: string) {
    const bytes = readFileSync(path).subarray(0, 16);
    if (contentType === "video/webm") {
      if (bytes.length < 4 || bytes.subarray(0,4).toString("hex") !== "1a45dfa3") {
        throw new BadRequestException("invalid WEBM video file");
      }
      return;
    }

    if (bytes.length < 12 || bytes.subarray(4,8).toString("ascii") !== "ftyp") {
      throw new BadRequestException("invalid MP4/MOV video file");
    }
  }

  async upload(file: any, body: any, actor: string) {
    if (!file?.path) throw new BadRequestException("video file required");
    const tempPath = String(file.path);
    let finalPath = "";

    try {
      const modeKey = this.mode(body?.modeKey);
      const title =
        String(body?.title || "").trim().slice(0, 180) ||
        `วิดีโอแนะนำ ${modeKey.replace("_", " ")}`;
      const contentType = String(file.mimetype || "").toLowerCase();
      const extension = VIDEO_TYPES[contentType];
      if (!extension) {
        throw new BadRequestException("รองรับวิดีโอ MP4, MOV และ WEBM เท่านั้น");
      }

      const sizeBytes = Number(file.size || statSync(tempPath).size || 0);
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        throw new BadRequestException("empty video");
      }
      if (sizeBytes > MAX_VIDEO_BYTES) {
        throw new BadRequestException("วิดีโอต้องมีขนาดไม่เกิน 300 MB");
      }

      const width = Math.trunc(Number(body?.width || 0));
      const height = Math.trunc(Number(body?.height || 0));
      if (width <= 0 || height <= 0) {
        throw new BadRequestException("ไม่สามารถตรวจสอบขนาดวิดีโอได้");
      }
      if (height <= width || width / height > 0.85) {
        throw new BadRequestException("รองรับเฉพาะวิดีโอแนวตั้งเท่านั้น");
      }

      const durationRaw = Number(body?.durationSeconds || 0);
      const durationSeconds =
        Number.isFinite(durationRaw) && durationRaw > 0
          ? Math.min(durationRaw, 24 * 60 * 60)
          : null;
      const sortOrder = Math.max(-9999, Math.min(9999, Math.trunc(Number(body?.sortOrder || 0))));

      this.validateFileSignature(tempPath, contentType);

      const storageName = randomUUID() + extension;
      finalPath = join(this.mediaRoot, storageName);
      copyFileSync(tempPath, finalPath);

      const inserted = await this.db.one(
        `INSERT INTO mode_guide_videos(
           mode_key,title,original_name,storage_name,content_type,size_bytes,
           width,height,duration_seconds,sort_order,is_active,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
         RETURNING id,mode_key,title,original_name,content_type,size_bytes,width,height,
                   duration_seconds,sort_order,is_active,created_at,updated_at`,
        [
          modeKey,
          title,
          String(file.originalname || "").slice(0, 240) || null,
          storageName,
          contentType,
          sizeBytes,
          width,
          height,
          durationSeconds,
          sortOrder,
          String(actor || "ADMIN").slice(0, 180)
        ]
      );
      return this.row(inserted);
    } catch (error) {
      if (finalPath && existsSync(finalPath)) {
        try { unlinkSync(finalPath); } catch {}
      }
      throw error;
    } finally {
      if (existsSync(tempPath)) {
        try { unlinkSync(tempPath); } catch {}
      }
    }
  }

  async update(idRaw: unknown, body: any) {
    const id = this.uuid(idRaw);
    const existing = await this.db.one("SELECT * FROM mode_guide_videos WHERE id=$1", [id]);
    if (!existing) throw new NotFoundException("video not found");

    const title = String(body?.title ?? existing.title).trim().slice(0,180);
    if (!title) throw new BadRequestException("video title required");
    const sortOrder = Math.max(
      -9999,
      Math.min(9999, Math.trunc(Number(body?.sortOrder ?? existing.sort_order ?? 0)))
    );
    const isActive =
      typeof body?.isActive === "boolean"
        ? body.isActive
        : existing.is_active === true;

    const row = await this.db.one(
      `UPDATE mode_guide_videos
       SET title=$2,sort_order=$3,is_active=$4,updated_at=now()
       WHERE id=$1
       RETURNING id,mode_key,title,original_name,content_type,size_bytes,width,height,
                 duration_seconds,sort_order,is_active,created_at,updated_at`,
      [id,title,sortOrder,isActive]
    );
    return this.row(row);
  }

  async remove(idRaw: unknown) {
    const id = this.uuid(idRaw);
    const row = await this.db.one(
      "DELETE FROM mode_guide_videos WHERE id=$1 RETURNING id,storage_name",
      [id]
    );
    if (!row) throw new NotFoundException("video not found");

    const storageName = basename(String(row.storage_name || ""));
    const path = join(this.mediaRoot, storageName);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch {}
    }
    return { ok: true, id };
  }

  async content(idRaw: unknown) {
    const id = this.uuid(idRaw);
    const row = await this.db.one(
      `SELECT id,storage_name,content_type,size_bytes,title
       FROM mode_guide_videos
       WHERE id=$1`,
      [id]
    );
    if (!row) throw new NotFoundException("video not found");

    const storageName = basename(String(row.storage_name || ""));
    if (!storageName || extname(storageName) === "") {
      throw new NotFoundException("video file not found");
    }
    const path = join(this.mediaRoot, storageName);
    if (!existsSync(path)) throw new NotFoundException("video file not found");

    return {
      path,
      contentType: String(row.content_type || "video/mp4"),
      sizeBytes: Number(statSync(path).size),
      title: String(row.title || "SCENOVA Trading Mode Guide")
    };
  }
}
