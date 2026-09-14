import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer downloads are streamed by the server so the browser keeps the
// personalized enrollment filename instead of buffering a large EXE in JS.
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const ENROLLMENT_RE = /^[A-Za-z0-9_-]{12,128}$/;

function installerPath(version: string) {
  const fileName = `SCENOVA-Setup-v${version}.exe`;
  const candidates = [
    resolve(process.cwd(), "public", "downloads", fileName),
    resolve(process.cwd(), "apps", "web", "public", "downloads", fileName),
    resolve("/app/apps/web/public/downloads", fileName)
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

async function downloadResponse(request: Request) {
  const form = await request.formData();
  const version = String(form.get("version") || "").trim();
  const code = String(form.get("code") || "").trim();

  if (!VERSION_RE.test(version) || !ENROLLMENT_RE.test(code)) {
    return new Response("Invalid SCENOVA installer request", {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const path = installerPath(version);
  if (!path) {
    return new Response("SCENOVA installer is not ready", {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const size = statSync(path).size;
  const stream = createReadStream(path);
  const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  const downloadName = `SCENOVA-Setup-v${version}-${code}.exe`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.microsoft.portable-executable",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function POST(request: Request) {
  return downloadResponse(request);
}
