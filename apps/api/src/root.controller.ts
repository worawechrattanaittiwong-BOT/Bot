import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

@Controller()
export class RootController {
  @Get()
  root(@Res() res: Response) {
    const host = String(res.req.headers.host || "");
    const protocol = String(res.req.headers["x-forwarded-proto"] || "https");

    // GitHub Codespaces forwarded hosts look like:
    // <codespace>-4000.app.github.dev
    // Redirect to the matching web port automatically.
    if (host.includes("-4000.app.github.dev")) {
      return res.redirect(302, protocol + "://" + host.replace("-4000.app.github.dev", "-3000.app.github.dev"));
    }

    // Local/dev fallback.
    if (host.startsWith("localhost:4000") || host.startsWith("127.0.0.1:4000")) {
      return res.redirect(302, "http://localhost:3000");
    }

    return res.status(200).json({
      ok: true,
      service: "bot-api",
      web: "Open the web application on port 3000",
      health: "/api/health"
    });
  }
}
