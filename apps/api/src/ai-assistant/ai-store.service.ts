import { Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AiAssistantSettings, AiSupportChannel } from "./ai-assistant.types";

@Injectable()
export class AiStoreService {
  constructor(private readonly db: DbService) {}

  async settings(): Promise<AiAssistantSettings> {
    const row = await this.db.one(
      `SELECT enabled,provider,model,daily_message_limit,max_history_messages,max_output_tokens,system_note
       FROM ai_assistant_settings WHERE id=1`
    );
    return {
      enabled: row?.enabled !== false,
      provider: String(row?.provider || "INCEPTION").toUpperCase(),
      model: String(row?.model || "mercury-2.5"),
      dailyMessageLimit: Math.max(1, Number(row?.daily_message_limit || 30)),
      maxHistoryMessages: Math.max(2, Number(row?.max_history_messages || 12)),
      maxOutputTokens: Math.max(128, Number(row?.max_output_tokens || 700)),
      systemNote: String(row?.system_note || "")
    };
  }

  async updateSettings(input: Partial<AiAssistantSettings>, actor: string) {
    const current = await this.settings();
    const enabled = input.enabled ?? current.enabled;
    const provider = String(input.provider ?? current.provider).trim().toUpperCase();
    const model = String(input.model ?? current.model).trim().slice(0, 120);
    const daily = Math.max(1, Math.min(1000, Number(input.dailyMessageLimit ?? current.dailyMessageLimit)));
    const history = Math.max(2, Math.min(40, Number(input.maxHistoryMessages ?? current.maxHistoryMessages)));
    const output = Math.max(128, Math.min(4000, Number(input.maxOutputTokens ?? current.maxOutputTokens)));
    const note = String(input.systemNote ?? current.systemNote).slice(0, 6000);
    await this.db.query(
      `UPDATE ai_assistant_settings
       SET enabled=$1,provider=$2,model=$3,daily_message_limit=$4,max_history_messages=$5,
           max_output_tokens=$6,system_note=$7,updated_by=$8,updated_at=now()
       WHERE id=1`,
      [enabled, provider, model, daily, history, output, note, actor]
    );
    return this.settings();
  }

  async supportChannels(): Promise<AiSupportChannel[]> {
    const rows = await this.db.query(
      `SELECT id,channel_type,label,url,enabled,sort_order
       FROM ai_support_channels
       WHERE enabled=true AND btrim(url)<>''
       ORDER BY sort_order,label`
    );
    return rows.rows.map((row: any) => ({
      id: String(row.id),
      type: String(row.channel_type),
      label: String(row.label),
      url: String(row.url),
      enabled: row.enabled === true,
      sortOrder: Number(row.sort_order || 0)
    }));
  }

  async adminSupportChannels() {
    const rows = await this.db.query(
      `SELECT id,channel_type,label,url,enabled,sort_order,updated_by,updated_at
       FROM ai_support_channels ORDER BY sort_order,label`
    );
    return rows.rows;
  }

  async saveSupportChannel(input: any, actor: string) {
    const type = String(input.type || "").trim().toUpperCase();
    if (!["LINE","FACEBOOK","TELEGRAM","OTHER"].includes(type)) throw new Error("invalid support channel");
    const label = String(input.label || type).trim().slice(0, 80);
    const url = String(input.url || "").trim().slice(0, 1200);
    if (url && !/^https:\/\//i.test(url)) throw new Error("support channel URL must use https");
    const enabled = input.enabled === true && Boolean(url);
    const sortOrder = Math.max(0, Math.min(9999, Number(input.sortOrder || 0)));
    await this.db.query(
      `INSERT INTO ai_support_channels(channel_type,label,url,enabled,sort_order,updated_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT(channel_type) DO UPDATE SET
         label=EXCLUDED.label,url=EXCLUDED.url,enabled=EXCLUDED.enabled,
         sort_order=EXCLUDED.sort_order,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [type,label,url,enabled,sortOrder,actor]
    );
    return this.adminSupportChannels();
  }

  async knowledge(categories: string[]) {
    const normalized = Array.from(new Set(["GENERAL","RISK",...categories.map(v => String(v).toUpperCase())]));
    const rows = await this.db.query(
      `SELECT slug,category,title,content,version
       FROM ai_knowledge_articles
       WHERE active=true AND category=ANY($1::varchar[])
       ORDER BY sort_order,title
       LIMIT 12`,
      [normalized]
    );
    return rows.rows;
  }

  async adminKnowledge() {
    const rows = await this.db.query(
      `SELECT id,slug,category,title,content,version,active,sort_order,updated_by,updated_at
       FROM ai_knowledge_articles ORDER BY sort_order,title`
    );
    return rows.rows;
  }

  async saveKnowledge(input: any, actor: string) {
    const slug = String(input.slug || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,119}$/.test(slug)) throw new Error("invalid knowledge slug");
    const category = String(input.category || "GENERAL").trim().toUpperCase().slice(0, 48);
    const title = String(input.title || "").trim().slice(0, 180);
    const content = String(input.content || "").trim().slice(0, 20000);
    if (!title || !content) throw new Error("knowledge title/content required");
    const active = input.active !== false;
    const sortOrder = Math.max(0, Math.min(9999, Number(input.sortOrder || 0)));
    await this.db.query(
      `INSERT INTO ai_knowledge_articles(slug,category,title,content,active,sort_order,updated_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT(slug) DO UPDATE SET
         category=EXCLUDED.category,title=EXCLUDED.title,content=EXCLUDED.content,
         version=ai_knowledge_articles.version+1,active=EXCLUDED.active,
         sort_order=EXCLUDED.sort_order,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [slug,category,title,content,active,sortOrder,actor]
    );
    return this.adminKnowledge();
  }

  async conversation(id: string, userId: string) {
    return this.db.one(
      `SELECT id,user_id,slot_id,title,status,created_at,updated_at
       FROM ai_conversations WHERE id=$1 AND user_id=$2`,
      [id,userId]
    );
  }

  async createConversation(userId: string, slotId: string | null, title: string) {
    return this.db.one(
      `INSERT INTO ai_conversations(user_id,slot_id,title)
       VALUES($1,$2,$3) RETURNING id,user_id,slot_id,title,status,created_at,updated_at`,
      [userId,slotId,title.slice(0,180)]
    );
  }

  async appendMessage(
    conversationId: string,
    role: "USER" | "ASSISTANT",
    content: string,
    meta: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number } = {}
  ) {
    await this.db.query(
      `INSERT INTO ai_messages(conversation_id,role,content,provider,model,input_tokens,output_tokens)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        conversationId, role, content, meta.provider || null, meta.model || null,
        Math.max(0, Number(meta.inputTokens || 0)), Math.max(0, Number(meta.outputTokens || 0))
      ]
    );
    await this.db.query("UPDATE ai_conversations SET updated_at=now() WHERE id=$1", [conversationId]);
  }

  async recentMessages(conversationId: string, limit: number) {
    const rows = await this.db.query(
      `SELECT role,content
       FROM (
         SELECT id,role,content
         FROM ai_messages WHERE conversation_id=$1
         ORDER BY id DESC LIMIT $2
       ) recent
       ORDER BY id`,
      [conversationId, Math.max(2, Math.min(40, limit))]
    );
    return rows.rows;
  }

  async messagesForUser(conversationId: string, userId: string, limit = 40) {
    const conversation = await this.conversation(conversationId, userId);
    if (!conversation) return null;
    const rows = await this.db.query(
      `SELECT id,role,content,created_at
       FROM ai_messages WHERE conversation_id=$1
       ORDER BY id DESC LIMIT $2`,
      [conversationId, Math.max(1, Math.min(100, limit))]
    );
    return { conversation, messages: rows.rows.reverse() };
  }

  async conversations(userId: string, limit = 12) {
    const rows = await this.db.query(
      `SELECT id,slot_id,title,status,created_at,updated_at,
              (SELECT content FROM ai_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message
       FROM ai_conversations c
       WHERE user_id=$1 AND status='ACTIVE'
       ORDER BY updated_at DESC LIMIT $2`,
      [userId, Math.max(1, Math.min(30, limit))]
    );
    return rows.rows;
  }

  async usageToday(userId: string) {
    const row = await this.db.one(
      `SELECT requests,input_tokens,output_tokens
       FROM ai_usage_daily
       WHERE user_id=$1 AND usage_date=(now() AT TIME ZONE 'Asia/Bangkok')::date`,
      [userId]
    );
    return {
      requests: Number(row?.requests || 0),
      inputTokens: Number(row?.input_tokens || 0),
      outputTokens: Number(row?.output_tokens || 0)
    };
  }

  async incrementUsage(userId: string, inputTokens: number, outputTokens: number) {
    await this.db.query(
      `INSERT INTO ai_usage_daily(user_id,usage_date,requests,input_tokens,output_tokens)
       VALUES($1,(now() AT TIME ZONE 'Asia/Bangkok')::date,1,$2,$3)
       ON CONFLICT(user_id,usage_date) DO UPDATE SET
         requests=ai_usage_daily.requests+1,
         input_tokens=ai_usage_daily.input_tokens+EXCLUDED.input_tokens,
         output_tokens=ai_usage_daily.output_tokens+EXCLUDED.output_tokens,
         updated_at=now()`,
      [userId,Math.max(0,inputTokens),Math.max(0,outputTokens)]
    );
  }

  async adminUsage(days = 14) {
    const safeDays = Math.max(1, Math.min(90, Number(days || 14)));
    const rows = await this.db.query(
      `SELECT usage_date,SUM(requests)::int requests,SUM(input_tokens)::bigint input_tokens,
              SUM(output_tokens)::bigint output_tokens,COUNT(DISTINCT user_id)::int users
       FROM ai_usage_daily
       WHERE usage_date >= (now() AT TIME ZONE 'Asia/Bangkok')::date - ($1::int - 1)
       GROUP BY usage_date ORDER BY usage_date DESC`,
      [safeDays]
    );
    return rows.rows;
  }
}
