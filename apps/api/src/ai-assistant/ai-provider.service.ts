import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { AiAssistantSettings, AiConversationMessage } from "./ai-assistant.types";

type ProviderResult = {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

type ApiStyle =
  | "OPENAI_COMPATIBLE_CHAT"
  | "OPENAI_RESPONSES"
  | "GEMINI"
  | "ANTHROPIC";

@Injectable()
export class AiProviderService {
  private config(settings: AiAssistantSettings) {
    const apiKey = String(process.env.SCENOVA_AI_API_KEY || "").trim();
    const baseUrl = String(process.env.SCENOVA_AI_BASE_URL || "").trim().replace(/\/+$/, "");
    const apiStyle = String(process.env.SCENOVA_AI_API_STYLE || "OPENAI_COMPATIBLE_CHAT")
      .trim()
      .toUpperCase() as ApiStyle;
    const configuredProvider = String(settings.provider || "").trim().toUpperCase();
    const provider = String(
      (!configuredProvider || configuredProvider === "CUSTOM")
        ? process.env.SCENOVA_AI_PROVIDER || configuredProvider || "CUSTOM"
        : configuredProvider
    ).trim().toUpperCase();
    const model = String(settings.model || process.env.SCENOVA_AI_MODEL || "").trim();
    return { apiKey, baseUrl, apiStyle, provider, model };
  }

  configured(settings: AiAssistantSettings) {
    const cfg = this.config(settings);
    return settings.enabled &&
      Boolean(cfg.apiKey) &&
      Boolean(cfg.baseUrl) &&
      Boolean(cfg.model) &&
      ["OPENAI_COMPATIBLE_CHAT","OPENAI_RESPONSES","GEMINI","ANTHROPIC"].includes(cfg.apiStyle);
  }

  private async request(url: string, apiKey: string, init: RequestInit, apiStyle: ApiStyle) {
    if (!/^https:\/\//i.test(url)) {
      throw new ServiceUnavailableException("AI Provider URL ไม่ปลอดภัย");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      if (apiStyle === "GEMINI") {
        headers.set("x-goog-api-key", apiKey);
      } else if (apiStyle === "ANTHROPIC") {
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", "2023-06-01");
      } else {
        headers.set("Authorization", "Bearer " + apiKey);
      }
      return await fetch(url, { ...init, headers, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        throw new ServiceUnavailableException("AI Provider ตอบช้าเกินเวลา");
      }
      throw new ServiceUnavailableException("เชื่อมต่อ AI Provider ไม่สำเร็จ");
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseError(response: Response): Promise<never> {
    const data: any = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableException("AI Provider API Key ไม่มีสิทธิ์หรือไม่ถูกต้อง");
    }
    throw new ServiceUnavailableException(
      "AI Provider ไม่พร้อมใช้งาน" +
      (data?.error?.message ? ": " + String(data.error.message).slice(0, 180) : "")
    );
  }

  private async openAiCompatibleChat(
    baseUrl: string,
    apiKey: string,
    model: string,
    instructions: string,
    messages: AiConversationMessage[],
    maxOutputTokens: number
  ): Promise<Omit<ProviderResult, "provider">> {
    const response = await this.request(baseUrl + "/chat/completions", apiKey, {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: instructions },
          ...messages.map(message => ({
            role: message.role === "ASSISTANT" ? "assistant" : "user",
            content: message.content
          }))
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.2
      })
    }, "OPENAI_COMPATIBLE_CHAT");
    if (!response.ok) await this.parseError(response);
    const data: any = await response.json().catch(() => ({}));
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!text) {
      throw new ServiceUnavailableException("AI Provider ไม่ได้ส่งข้อความตอบกลับ");
    }
    return {
      text,
      model: String(data?.model || model),
      inputTokens: Math.max(0, Number(data?.usage?.prompt_tokens || 0)),
      outputTokens: Math.max(0, Number(data?.usage?.completion_tokens || 0))
    };
  }

  private async openAiResponses(
    baseUrl: string,
    apiKey: string,
    model: string,
    instructions: string,
    messages: AiConversationMessage[],
    maxOutputTokens: number
  ): Promise<Omit<ProviderResult, "provider">> {
    const response = await this.request(baseUrl + "/responses", apiKey, {
      method: "POST",
      body: JSON.stringify({
        model,
        instructions,
        input: messages.map(message => ({
          role: message.role === "ASSISTANT" ? "assistant" : "user",
          content: message.content
        })),
        max_output_tokens: maxOutputTokens,
        store: false
      })
    }, "OPENAI_RESPONSES");
    if (!response.ok) await this.parseError(response);
    const data: any = await response.json().catch(() => ({}));
    let text = typeof data?.output_text === "string" ? data.output_text.trim() : "";
    if (!text && Array.isArray(data?.output)) {
      text = data.output
        .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
        .filter((item: any) => item?.type === "output_text" && typeof item?.text === "string")
        .map((item: any) => item.text)
        .join("\n")
        .trim();
    }
    if (!text) {
      throw new ServiceUnavailableException("AI Provider ไม่ได้ส่งข้อความตอบกลับ");
    }
    return {
      text,
      model: String(data?.model || model),
      inputTokens: Math.max(0, Number(data?.usage?.input_tokens || 0)),
      outputTokens: Math.max(0, Number(data?.usage?.output_tokens || 0))
    };
  }

  private async gemini(
    baseUrl: string,
    apiKey: string,
    model: string,
    instructions: string,
    messages: AiConversationMessage[],
    maxOutputTokens: number
  ): Promise<Omit<ProviderResult, "provider">> {
    const response = await this.request(
      baseUrl + "/models/" + encodeURIComponent(model) + ":generateContent",
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          system_instruction: { parts: [{ text: instructions }] },
          contents: messages.map(message => ({
            role: message.role === "ASSISTANT" ? "model" : "user",
            parts: [{ text: message.content }]
          })),
          generationConfig: {
            maxOutputTokens,
            temperature: 0.2
          }
        })
      },
      "GEMINI"
    );
    if (!response.ok) await this.parseError(response);
    const data: any = await response.json().catch(() => ({}));
    const text = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
          .map((part: any) => String(part?.text || ""))
          .join("\n")
          .trim()
      : "";
    if (!text) {
      throw new ServiceUnavailableException("AI Provider ไม่ได้ส่งข้อความตอบกลับ");
    }
    return {
      text,
      model,
      inputTokens: Math.max(0, Number(data?.usageMetadata?.promptTokenCount || 0)),
      outputTokens: Math.max(0, Number(data?.usageMetadata?.candidatesTokenCount || 0))
    };
  }

  private async anthropic(
    baseUrl: string,
    apiKey: string,
    model: string,
    instructions: string,
    messages: AiConversationMessage[],
    maxOutputTokens: number
  ): Promise<Omit<ProviderResult, "provider">> {
    const response = await this.request(baseUrl + "/messages", apiKey, {
      method: "POST",
      body: JSON.stringify({
        model,
        system: instructions,
        messages: messages.map(message => ({
          role: message.role === "ASSISTANT" ? "assistant" : "user",
          content: message.content
        })),
        max_tokens: maxOutputTokens,
        temperature: 0.2
      })
    }, "ANTHROPIC");
    if (!response.ok) await this.parseError(response);
    const data: any = await response.json().catch(() => ({}));
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((part: any) => part?.type === "text")
          .map((part: any) => String(part?.text || ""))
          .join("\n")
          .trim()
      : "";
    if (!text) {
      throw new ServiceUnavailableException("AI Provider ไม่ได้ส่งข้อความตอบกลับ");
    }
    return {
      text,
      model: String(data?.model || model),
      inputTokens: Math.max(0, Number(data?.usage?.input_tokens || 0)),
      outputTokens: Math.max(0, Number(data?.usage?.output_tokens || 0))
    };
  }

  async generate(
    settings: AiAssistantSettings,
    instructions: string,
    messages: AiConversationMessage[]
  ): Promise<ProviderResult> {
    if (!settings.enabled) {
      throw new ServiceUnavailableException("SCENOVA AI ถูกปิดใช้งานชั่วคราว");
    }
    const cfg = this.config(settings);
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      throw new ServiceUnavailableException("SCENOVA AI ยังไม่ได้ตั้งค่า AI Provider");
    }

    const result = cfg.apiStyle === "OPENAI_RESPONSES"
      ? await this.openAiResponses(
          cfg.baseUrl,
          cfg.apiKey,
          cfg.model,
          instructions,
          messages,
          settings.maxOutputTokens
        )
      : cfg.apiStyle === "GEMINI"
        ? await this.gemini(
            cfg.baseUrl,
            cfg.apiKey,
            cfg.model,
            instructions,
            messages,
            settings.maxOutputTokens
          )
        : cfg.apiStyle === "ANTHROPIC"
          ? await this.anthropic(
              cfg.baseUrl,
              cfg.apiKey,
              cfg.model,
              instructions,
              messages,
              settings.maxOutputTokens
            )
          : await this.openAiCompatibleChat(
              cfg.baseUrl,
              cfg.apiKey,
              cfg.model,
              instructions,
              messages,
              settings.maxOutputTokens
            );

    return {
      ...result,
      provider: cfg.provider
    };
  }
}
