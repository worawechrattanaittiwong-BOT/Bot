import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import { ModeGuideVideoService } from "./mode-guide-video.service";
import { AdminGuard, JwtGuard } from "./security";

const TEMP_VIDEO_DIR = "/tmp/scenova-mode-guide-upload";
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4","video/quicktime","video/webm"]);

const modeGuideUpload = FileInterceptor("video", {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
      cb(null, TEMP_VIDEO_DIR);
    },
    filename: (_req, _file, cb) => cb(null, randomUUID() + ".upload")
  }),
  limits: {
    files: 1,
    fileSize: MAX_VIDEO_BYTES
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIDEO_TYPES.has(String(file.mimetype || "").toLowerCase())) {
      cb(new BadRequestException("รองรับวิดีโอ MP4, MOV และ WEBM เท่านั้น") as any, false);
      return;
    }
    cb(null, true);
  }
});

@Controller("mode-guide-videos")
export class ModeGuideVideoController {
  constructor(private readonly videos: ModeGuideVideoService) {}

  @Get()
  @UseGuards(JwtGuard)
  list() {
    return this.videos.activeList();
  }

  @Get(":id/content")
  async content(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const video = await this.videos.content(id);
    const total = video.sizeBytes;
    const range = String(req.headers.range || "");

    res.setHeader("Content-Type", video.contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Disposition", "inline");

    if (!range) {
      res.setHeader("Content-Length", String(total));
      return res.sendFile(video.path);
    }

    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.end();
    }

    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;

    if (!match[1] && match[2]) {
      const suffix = Math.max(1, Number(match[2]));
      start = Math.max(0, total - suffix);
      end = total - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= total
    ) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.end();
    }

    end = Math.min(end, total - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(end - start + 1));

    const { createReadStream } = await import("fs");
    return createReadStream(video.path, { start, end }).pipe(res);
  }
}

@Controller("admin/mode-guide-videos")
@UseGuards(AdminGuard)
export class ModeGuideVideoAdminController {
  constructor(private readonly videos: ModeGuideVideoService) {}

  @Get()
  list() {
    return this.videos.adminList();
  }

  @Post("upload")
  @UseInterceptors(modeGuideUpload)
  upload(
    @UploadedFile() file: any,
    @Body() body: any,
    @Req() req: any
  ) {
    const actor = req.user?.sub
      ? String(req.user.role || "ADMIN") + ":" + String(req.user.sub)
      : "ADMIN_KEY";
    return this.videos.upload(file, body || {}, actor);
  }

  @Post(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.videos.update(id, body || {});
  }

  @Post(":id/delete")
  remove(@Param("id") id: string) {
    return this.videos.remove(id);
  }
}
