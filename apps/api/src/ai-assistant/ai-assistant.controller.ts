import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AdminGuard, JwtGuard } from "../security";
import { AiAssistantService } from "./ai-assistant.service";

@Controller("ai-assistant")
@UseGuards(JwtGuard)
export class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Get("bootstrap")
  bootstrap(@Req() req: any, @Query("slotId") slotId = "") {
    return this.assistant.bootstrap(String(req.user.sub), String(req.user.role || "USER"), slotId);
  }

  @Get("conversations")
  conversations(@Req() req: any, @Query("limit") limit = "12") {
    return this.assistant.conversations(String(req.user.sub), Number(limit || 12));
  }

  @Get("conversations/:id/messages")
  messages(
    @Req() req: any,
    @Param("id") id: string,
    @Query("limit") limit = "40"
  ) {
    return this.assistant.conversationMessages(String(req.user.sub), id, Number(limit || 40));
  }

  @Post("chat")
  chat(@Req() req: any, @Body() body: any) {
    return this.assistant.chat({
      userId: String(req.user.sub),
      role: String(req.user.role || "USER"),
      slotId: String(body?.slotId || ""),
      conversationId: body?.conversationId ? String(body.conversationId) : undefined,
      message: body?.message
    });
  }
}

@Controller("admin/ai-assistant")
@UseGuards(AdminGuard)
export class AdminAiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  private actor(req: any) {
    return req.user?.sub
      ? String(req.user.role || "ADMIN") + ":" + String(req.user.sub)
      : "ADMIN_KEY";
  }

  @Get("settings")
  settings() {
    return this.assistant.adminSettings();
  }

  @Put("settings")
  updateSettings(@Req() req: any, @Body() body: any) {
    return this.assistant.adminUpdateSettings(body || {}, this.actor(req));
  }

  @Get("contacts")
  contacts() {
    return this.assistant.adminContacts();
  }

  @Put("contacts")
  saveContact(@Req() req: any, @Body() body: any) {
    return this.assistant.adminSaveContact(body || {}, this.actor(req));
  }

  @Get("knowledge")
  knowledge() {
    return this.assistant.adminKnowledge();
  }

  @Put("knowledge")
  saveKnowledge(@Req() req: any, @Body() body: any) {
    return this.assistant.adminSaveKnowledge(body || {}, this.actor(req));
  }

  @Get("usage")
  usage(@Query("days") days = "14") {
    return this.assistant.adminUsage(Number(days || 14));
  }
}
