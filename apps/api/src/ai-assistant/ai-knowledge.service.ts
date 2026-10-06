import { Injectable } from "@nestjs/common";
import { AiStoreService } from "./ai-store.service";
import type { AiSlotContext } from "./ai-assistant.types";

@Injectable()
export class AiKnowledgeService {
  constructor(private readonly store: AiStoreService) {}

  private categories(message: string, context: AiSlotContext | null) {
    const text = String(message || "").toLowerCase();
    const result = new Set<string>();
    const addMode = (mode: string) => result.add(mode);

    if (/\bauto\b|ออโต้/.test(text)) addMode("AUTO");
    if (/\brace\b|เรซ/.test(text)) addMode("RACE");
    if (/\bcounter\b|เคาน์เตอร์/.test(text)) addMode("COUNTER");
    if (/flip[ _-]?lock|ฟลิป/.test(text)) addMode("FLIP_LOCK");
    if (/zero[ _-]?grid|ซีโร่|กริด/.test(text)) addMode("ZERO_GRID");
    if (/\bmanual\b|แมนนวล|กำหนดเอง/.test(text)) addMode("MANUAL");
    if (/โหมด|mode/.test(text)) {
      ["AUTO","RACE","COUNTER","FLIP_LOCK","ZERO_GRID","MANUAL"].forEach(addMode);
    }
    if (/mt5|ea\b|heartbeat|offline|online|safe stop|เซฟสต็อป|ติดตั้ง|เชื่อมต่อ/.test(text)) result.add("MT5");
    if (/exness|broker|โบรก/.test(text)) result.add("BROKER");
    if (/เสี่ยง|risk|drawdown|floating|margin|lot|ล็อต|ทุน/.test(text)) result.add("RISK");
    if (context?.controlMode) result.add(String(context.controlMode).toUpperCase());
    return Array.from(result);
  }

  async relevant(message: string, context: AiSlotContext | null) {
    return this.store.knowledge(this.categories(message, context));
  }
}
