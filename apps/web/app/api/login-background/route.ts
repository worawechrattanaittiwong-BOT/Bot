import { LOGIN_HERO_DATA_URI } from "../../login/loginHero.generated";

export const runtime = "nodejs";

const DATA_URI_PREFIX = "data:image/webp;base64,";

export async function GET() {
  if (!LOGIN_HERO_DATA_URI.startsWith(DATA_URI_PREFIX)) {
    return new Response("Invalid login background", { status: 500 });
  }

  const base64 = LOGIN_HERO_DATA_URI.slice(DATA_URI_PREFIX.length);
  const image = Buffer.from(base64, "base64");

  return new Response(image, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
