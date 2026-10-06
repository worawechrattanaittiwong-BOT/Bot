import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { AiContextService } from "./ai-context.service";
import { AiKnowledgeService } from "./ai-knowledge.service";
import { AiProviderService } from "./ai-provider.service";
import { AiSafetyService } from "./ai-safety.service";
import { AiStoreService } from "./ai-store.service";
import type { AiConversationMessage } from "./ai-assistant.types";

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly store: AiStoreService,
    private readonly context: AiContextService,
    private readonly knowledge: AiKnowledgeService,
    private readonly safety: AiSafetyService,
    private readonly provider: AiProviderService
  ) {}

  private elevated(role: string) {
    return ["OWNER","ADMIN"].includes(String(role || "").toUpperCase());
  }

  private suggestions(controlMode: string | null) {
    const common = [
      "ช่วยดูการตั้งค่าปัจจุบันว่ามีจุดไหนเสี่ยงบ้าง",
      "ทำไม EA Offline และควรตรวจอะไรบ้าง",
      "Safe Stop คืออะไร"
    ];
    if (!controlMode) return ["อธิบายโหมดการเทรดของ SCENOVA", ...common];
    return [
      "อธิบายโหมด " + controlMode + " ให้หน่อย",
      "ค่าของ " + controlMode + " ตอนนี้มีความเสี่ยงอะไรบ้าง",
      ...common.slice(1)
    ];
  }

  async bootstrap(userId: string, role: string, slotId = "") {
    const settings = await this.store.settings();
    const slot = await this.context.load(userId, role, slotId);
    const usage = await this.store.usageToday(userId);
    const contacts = await this.store.supportChannels();
    return {
      enabled: settings.enabled,
      configured: this.provider.configured(settings),
      provider: settings.provider,
      model: settings.model,
      dailyLimit: this.elevated(role) ? null : settings.dailyMessageLimit,
      usedToday: usage.requests,
      remainingToday: this.elevated(role)
        ? null
        : Math.max(0, settings.dailyMessageLimit - usage.requests),
      slot,
      suggestions: this.suggestions(slot?.controlMode || null),
      contacts
    };
  }

  async chat(input: {
    userId: string;
    role: string;
    slotId?: string;
    conversationId?: string;
    message: unknown;
  }) {
    const message = this.safety.normalizeMessage(input.message);
    const settings = await this.store.settings();
    if (!this.provider.configured(settings)) {
      if (!settings.enabled) throw new ServiceUnavailableException("SCENOVA AI ถูกปิดใช้งานชั่วคราว");
      throw new ServiceUnavailableException("SCENOVA AI ยังไม่ได้เชื่อม AI Provider");
    }

    const usage = await this.store.usageToday(input.userId);
    if (!this.elevated(input.role) && usage.requests >= settings.dailyMessageLimit) {
      throw new HttpException("ถึงจำนวนข้อความ AI สูงสุดของวันนี้แล้ว", HttpStatus.TOO_MANY_REQUESTS);
    }

    let conversation: any = null;
    let targetSlotId = String(input.slotId || "").trim();
    if (input.conversationId) {
      conversation = await this.store.conversation(String(input.conversationId), input.userId);
      if (!conversation) throw new NotFoundException("ไม่พบการสนทนานี้");
      targetSlotId = String(conversation.slot_id || targetSlotId || "");
    }

    const slot = await this.context.load(input.userId, input.role, targetSlotId);
    const historyRows = conversation
      ? await this.store.recentMessages(conversation.id, settings.maxHistoryMessages)
      : [];
    const history: AiConversationMessage[] = historyRows.map((row: any) => ({
      role: String(row.role) === "ASSISTANT" ? "ASSISTANT" : "USER",
      content: this.safety.redactSecrets(String(row.content || ""))
    }));
    history.push({ role: "USER", content: message });

    const knowledge = await this.knowledge.relevant(message, slot);
    const instructions = this.safety.instructions(slot, knowledge, settings.systemNote);
    const result = await this.provider.generate(settings, instructions, history);

    if (!conversation) {
      const title = message.length > 70 ? message.slice(0, 67) + "..." : message;
      conversation = await this.store.createConversation(input.userId, slot?.slotId || null, title);
    }

    await this.store.appendMessage(conversation.id, "USER", message);
    await this.store.appendMessage(conversation.id, "ASSISTANT", result.text, {
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    });
    await this.store.incrementUsage(input.userId, result.inputTokens, result.outputTokens);

    const nextUsage = usage.requests + 1;
    return {
      conversationId: String(conversation.id),
      message: result.text,
      slotId: slot?.slotId || null,
      provider: result.provider,
      model: result.model,
      remainingToday: this.elevated(input.role)
        ? null
        : Math.max(0, settings.dailyMessageLimit - nextUsage)
    };
  }

  conversations(userId: string, limit = 12) {
    return this.store.conversations(userId, limit);
  }

  async conversationMessages(userId: string, conversationId: string, limit = 40) {
    const result = await this.store.messagesForUser(conversationId, userId, limit);
    if (!result) throw new NotFoundException("ไม่พบการสนทนานี้");
    return result;
  }

  async adminSettings() {
    const settings = await this.store.settings();
    return {
      ...settings,
      configured: this.provider.configured(settings),
      apiKeyConfigured: Boolean(String(process.env.SCENOVA_AI_API_KEY || "").trim())
    };
  }

  adminUpdateSettings(body: any, actor: string) {
    return this.store.updateSettings({
      enabled: body.enabled,
      provider: body.provider,
      model: body.model,
      dailyMessageLimit: body.dailyMessageLimit,
      maxHistoryMessages: body.maxHistoryMessages,
      maxOutputTokens: body.maxOutputTokens,
      systemNote: body.systemNote
    }, actor);
  }

  adminContacts() {
    return this.store.adminSupportChannels();
  }

  adminSaveContact(body: any, actor: string) {
    return this.store.saveSupportChannel(body, actor);
  }

  adminKnowledge() {
    return this.store.adminKnowledge();
  }

  adminSaveKnowledge(body: any, actor: string) {
    return this.store.saveKnowledge(body, actor);
  }

  adminUsage(days: number) {
    return this.store.adminUsage(days);
  }
}
