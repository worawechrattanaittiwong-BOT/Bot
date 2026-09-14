import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { DbService } from "./db.service";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const raw = String(req.headers.authorization || "");
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    if (!token) throw new UnauthorizedException("missing token");
    try {
      req.user = this.jwt.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    const raw = String(req.headers.authorization || "");
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    if (token) {
      try {
        const user = this.jwt.verify(token);
        if (user?.role === "OWNER" || user?.role === "ADMIN") {
          req.user = user;
          return true;
        }
      } catch {
        // Fall through to the emergency admin key.
      }
    }

    const supplied = String(req.headers["x-admin-key"] || "");
    const expected = String(process.env.ADMIN_KEY || "");
    if (expected && supplied === expected) return true;

    throw new ForbiddenException("owner/admin access required");
  }
}

@Injectable()
export class WorkerGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const supplied = String(req.headers["x-worker-key"] || "");
    const expected = String(process.env.WORKER_KEY || "");
    const runnerId = String(req.body?.runnerId || "");
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId)) throw new ForbiddenException("runner ID required");
    const node = await this.db.one("SELECT worker_key_hash FROM worker_nodes WHERE runner_id=$1", [runnerId]);
    if (node?.worker_key_hash) {
      if (createHash("sha256").update(supplied).digest("hex") !== node.worker_key_hash) throw new ForbiddenException("worker key invalid");
    } else if (!expected || supplied !== expected) throw new ForbiddenException("worker key invalid");
    return true;
  }
}

@Injectable()
export class CryptoService {
  private key() {
    const raw = Buffer.from(process.env.CREDENTIAL_MASTER_KEY || "", "base64");
    if (raw.length !== 32) throw new Error("CREDENTIAL_MASTER_KEY must be 32 bytes base64");
    return raw;
  }

  encrypt(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64")
    };
  }

  decrypt(input: { ciphertext: string; iv: string; authTag: string }) {
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(input.iv, "base64"));
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  sha256(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
