import {
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService
  ) {}

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private async authEvent(userId: string | null, email: string, event: string, req: any) {
    await this.db.query(
      "INSERT INTO auth_events(user_id,email,event,ip_address) VALUES($1,$2,$3,$4)",
      [userId, email || null, event, this.clientIp(req)]
    );
  }

  @Get("session")
  @UseGuards(JwtGuard)
  async session(@Req() req: any) {
    const user = await this.db.one(
      "SELECT id,user_code,email,role,status FROM users WHERE id=$1",
      [req.user.sub]
    );
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("session unavailable");
    }
    return {
      authenticated: true,
      user: {
        id: user.id,
        userCode: user.user_code,
        email: user.email,
        role: user.role,
        status: user.status
      }
    };
  }

  @Post("register")
  async register(@Req() req: any, @Body() body: { email: string; password: string }) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || String(body.password || "").length < 8) {
      throw new ConflictException("email required and password must be at least 8 characters");
    }
    const existing = await this.db.one("SELECT id FROM users WHERE email=$1", [email]);
    if (existing) throw new ConflictException("email already exists");

    const passwordHash = await hash(body.password, 12);
    const code = "BOT-" + Date.now().toString(36).toUpperCase();
    const user = await this.db.one(
      "INSERT INTO users(user_code,email,password_hash) VALUES($1,$2,$3) RETURNING id,user_code,email,role,status",
      [code, email, passwordHash]
    );
    await this.authEvent(user.id, email, "REGISTER", req);
    return {
      user,
      token: this.jwt.sign({ sub: user.id, role: user.role, code: user.user_code })
    };
  }

  @Post("login")
  async login(@Req() req: any, @Body() body: { email: string; password: string }) {
    const email = String(body.email || "").trim().toLowerCase();
    const user = await this.db.one(
      "SELECT id,user_code,email,password_hash,role,status FROM users WHERE email=$1",
      [email]
    );
    if (!user || !(await compare(String(body.password || ""), user.password_hash))) {
      await this.authEvent(user?.id || null, email, "LOGIN_FAILED", req);
      throw new UnauthorizedException("invalid email or password");
    }
    if (user.status !== "ACTIVE") {
      await this.authEvent(user.id, email, "LOGIN_BLOCKED", req);
      throw new UnauthorizedException("account unavailable");
    }
    await this.authEvent(user.id, email, "LOGIN", req);
    return {
      user: {
        id: user.id,
        userCode: user.user_code,
        email: user.email,
        role: user.role
      },
      token: this.jwt.sign({ sub: user.id, role: user.role, code: user.user_code })
    };
  }
}
