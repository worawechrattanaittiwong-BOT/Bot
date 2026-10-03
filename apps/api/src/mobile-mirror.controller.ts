import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { randomBytes, randomUUID } from "crypto";
import { JwtGuard } from "./security";

type MirrorDescription = {
  type: "offer" | "answer";
  sdp: string;
  revision: number;
};

type MirrorSession = {
  id: string;
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  offer?: MirrorDescription;
  answer?: MirrorDescription;
};

const PAIR_TTL_MS = 10 * 60 * 1000;
const ACTIVE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SDP_LENGTH = 200_000;
const sessions = new Map<string, MirrorSession>();
const sessionIdByToken = new Map<string, string>();

function cleanupExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (session.expiresAt > now) continue;
    sessions.delete(id);
    sessionIdByToken.delete(session.token);
  }
}

function readDescription(body: any, expectedType: "offer" | "answer") {
  const type = String(body?.type || "").toLowerCase();
  const sdp = String(body?.sdp || "");
  if (type !== expectedType || !sdp || sdp.length > MAX_SDP_LENGTH || !sdp.includes("v=0")) {
    throw new BadRequestException("Invalid WebRTC session description");
  }
  return { type: expectedType, sdp };
}

@Controller("mobile-mirror")
export class MobileMirrorController {
  private ownedSession(userId: string, id: string) {
    cleanupExpiredSessions();
    const session = sessions.get(id);
    if (!session || session.userId !== userId) throw new NotFoundException("Mirror session not found");
    return session;
  }

  private tokenSession(token: string) {
    cleanupExpiredSessions();
    const normalized = String(token || "").trim();
    const id = sessionIdByToken.get(normalized);
    const session = id ? sessions.get(id) : undefined;
    if (!session || session.token !== normalized) throw new NotFoundException("Mirror session not found");
    return session;
  }

  @Post("sessions")
  @UseGuards(JwtGuard)
  @Header("Cache-Control", "no-store")
  createSession(@Req() req: any) {
    cleanupExpiredSessions();
    const now = Date.now();
    const session: MirrorSession = {
      id: randomUUID(),
      token: randomBytes(32).toString("hex"),
      userId: String(req.user.sub),
      createdAt: now,
      expiresAt: now + PAIR_TTL_MS
    };
    sessions.set(session.id, session);
    sessionIdByToken.set(session.token, session.id);
    return {
      sessionId: session.id,
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString()
    };
  }

  @Get("sessions/:id")
  @UseGuards(JwtGuard)
  @Header("Cache-Control", "no-store")
  getSession(@Req() req: any, @Param("id") id: string) {
    const session = this.ownedSession(String(req.user.sub), id);
    return {
      sessionId: session.id,
      state: session.answer ? "READY" : session.offer ? "OFFERED" : "WAITING",
      expiresAt: new Date(session.expiresAt).toISOString(),
      offer: session.offer || null
    };
  }

  @Post("sessions/:id/answer")
  @UseGuards(JwtGuard)
  @Header("Cache-Control", "no-store")
  setAnswer(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = this.ownedSession(String(req.user.sub), id);
    const next = readDescription(body, "answer");
    const revision = Number(session.answer?.revision || 0) + 1;
    session.answer = { ...next, revision };
    session.expiresAt = Date.now() + ACTIVE_TTL_MS;
    return { ok: true, revision };
  }

  @Delete("sessions/:id")
  @UseGuards(JwtGuard)
  @Header("Cache-Control", "no-store")
  deleteSession(@Req() req: any, @Param("id") id: string) {
    const session = this.ownedSession(String(req.user.sub), id);
    sessions.delete(session.id);
    sessionIdByToken.delete(session.token);
    return { ok: true };
  }

  @Get("connect/:token")
  @Header("Cache-Control", "no-store")
  getPublicSession(@Param("token") token: string) {
    const session = this.tokenSession(token);
    return {
      state: session.answer ? "READY" : session.offer ? "OFFERED" : "WAITING",
      expiresAt: new Date(session.expiresAt).toISOString()
    };
  }

  @Post("connect/:token/offer")
  @Header("Cache-Control", "no-store")
  setOffer(@Param("token") token: string, @Body() body: any) {
    const session = this.tokenSession(token);
    const next = readDescription(body, "offer");
    const revision = Number(session.offer?.revision || 0) + 1;
    session.offer = { ...next, revision };
    session.answer = undefined;
    session.expiresAt = Date.now() + ACTIVE_TTL_MS;
    return { ok: true, revision };
  }

  @Get("connect/:token/answer")
  @Header("Cache-Control", "no-store")
  getAnswer(@Param("token") token: string) {
    const session = this.tokenSession(token);
    return {
      answer: session.answer || null,
      expiresAt: new Date(session.expiresAt).toISOString()
    };
  }
}
