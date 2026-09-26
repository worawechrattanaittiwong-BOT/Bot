import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
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

  private versionAtLeast(current: unknown, required: string) {
    const parse = (value: unknown) => {
      const raw = String(value || "").trim().replace(/^v/i, "");
      if (!/^\d+(?:\.\d+){0,3}$/.test(raw)) return null;
      const parts = raw.split(".").map(Number);
      while (parts.length < 4) parts.push(0);
      return parts;
    };
    const a = parse(current);
    const b = parse(required);
    if (!a || !b) return false;
    for (let i = 0; i < 4; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return true;
  }

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const supplied = String(req.headers["x-worker-key"] || "");
    const expected = String(process.env.WORKER_KEY || "");
    const runnerId = String(req.body?.runnerId || "");
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId)) throw new ForbiddenException("runner ID required");
    const node = await this.db.one("SELECT worker_key_hash,telemetry FROM worker_nodes WHERE runner_id=$1", [runnerId]);
    if (node?.worker_key_hash) {
      if (createHash("sha256").update(supplied).digest("hex") !== node.worker_key_hash) throw new ForbiddenException("worker key invalid");
    } else if (!expected || supplied !== expected) throw new ForbiddenException("worker key invalid");

    // Worker v1.1.0 can still heartbeat and execute STOP_INSTANCE so existing
    // terminals remain manageable during a rolling upgrade. It may not receive
    // assigned/provision/recovery work because that version can auto-restart a
    // missing terminal without Phase 4 server authorization.
    const controlPath = String(req.path || req.url || "");
    const requiresHardeningProtocol = ["/assigned", "/claim-next", "/recovery-check", "/recovery-result", "/updates/next", "/updates/result", "/updates/artifact"]
      .some(suffix => controlPath.endsWith(suffix));
    if (requiresHardeningProtocol && !this.versionAtLeast(node?.telemetry?.version, "1.2.0")) {
      throw new ForbiddenException("Cloud Worker v1.2.0+ required for provisioning and recovery");
    }
    const requiresFleetUpdateProtocol = ["/updates/next", "/updates/result", "/updates/artifact"]
      .some(suffix => controlPath.endsWith(suffix));
    if (requiresFleetUpdateProtocol && !this.versionAtLeast(node?.telemetry?.version, "2.1.0")) {
      throw new ForbiddenException("Cloud Worker v2.1.0+ required for Fleet Update");
    }
    return true;
  }
}

@Injectable()
export class PayoutWorkerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const supplied = String(req.headers["x-payout-worker-key"] || "");
    const expected = String(process.env.PAYOUT_WORKER_KEY || "");
    if (!expected) throw new ForbiddenException("payout worker is not configured");
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException("payout worker key invalid");
    }
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

  sign(value: string) {
    return createHmac("sha256", this.key()).update(value).digest("base64url");
  }

  verifySignature(value: string, signature: string) {
    const expected = Buffer.from(this.sign(value));
    const supplied = Buffer.from(String(signature || ""));
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }
}
