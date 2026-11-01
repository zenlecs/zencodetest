import OpenAI from "openai";
import { client } from "../db";
import type { AIChatMessage, InsertAIChatMessage } from "@shared/schema";

export interface AIModelInfo {
  id: string;
  name: string;
  description: string;
  status: "active" | "needs_key" | "offline";
  provider: "groq" | "openai" | "embedded";
  isDefault: boolean;
}

export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Groq dönüşümlü model havuzu — her iki promptta bir sıradaki modele geçilir.
 * Sohbet modelleri. Prompt-guard gibi sohbet olmayan modeller burada durmaz.
 */
export const ROTATION_AI_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
] as const;

/** Sohbet için yetkili modeller. İstemciden gelen keyfi model adları kabul edilmez. */
export const DEFAULT_AI_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_AI_MODEL = "openai/gpt-oss-20b";
export const ALLOWED_AI_MODELS = [...ROTATION_AI_MODELS, FALLBACK_AI_MODEL] as const;

/**
 * Dönüşüm kuralı: her iki promptta bir sıradaki modele geç.
 * @param promptCount bugüne dek alınan kullanıcı promptu sayısı (bu tur dahil)
 */
export function resolveRotationModel(promptCount: number): string {
  const turn = Number.isFinite(promptCount) && promptCount > 0 ? Math.floor(promptCount) : 1;
  const index = Math.floor((turn - 1) / 2) % ROTATION_AI_MODELS.length;
  return ROTATION_AI_MODELS[index];
}

/**
 * Model başına Groq "max completion tokens" sınırı (Supported Models sayfası).
 * Sınırı aşan istekler API tarafından reddedilir; sadece liste dışı modeller 4096.
 */
const MODEL_MAX_COMPLETION: Record<string, number> = {};

/** Geçersiz/eksik model adını güvenli varsayılana çevirir. */
export function resolveAIModel(requested?: string | null): string {
  if (requested && (ALLOWED_AI_MODELS as readonly string[]).includes(requested)) {
    return requested;
  }
  return DEFAULT_AI_MODEL;
}

/**
 * Sağlayıcı hatalarını kullanıcıya gösterilebilir, sade mesajlara çevirir.
 * Ham sağlayıcı gövdesi (JSON/HTML) asla istemciye taşınmaz.
 */
export function describeAIError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.trim();

  if (/api[_ -]?key|401|unauthorized|invalid_api_key|authentication/i.test(text)) {
    return "Yapay zeka servisi kimlik doğrulaması başarısız. API anahtarını denetleyin.";
  }
  if (/429|rate limit|too many requests/i.test(text)) {
    return "Yapay zeka servisi şu anda yoğun. Lütfen kısa süre sonra tekrar deneyin.";
  }
  if (!text || text.startsWith("{") || text.startsWith("<") || text.length > 240) {
    return "Yapay zeka yanıtı üretilemedi. Lütfen tekrar deneyin.";
  }
  return text;
}

class ZenlecsAIService {
  private groqClient: OpenAI | null = null;
  private tablesInitialized: boolean = false;

  constructor() {
    this.initGroqClient();
  }

  private initGroqClient() {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      this.groqClient = null;
      return;
    }
    this.groqClient = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
      defaultHeaders: {
        "User-Agent": "Zenlecs-Desktop/1.0",
      },
    });
  }

  public async ensureTablesExist(): Promise<void> {
    if (this.tablesInitialized) return;
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "ai_conversations" (
          "id" serial PRIMARY KEY NOT NULL,
          "user_id" integer NOT NULL,
          "title" varchar(255) DEFAULT 'Yeni Sohbet' NOT NULL,
          "model" varchar(50) DEFAULT 'openai/gpt-oss-120b' NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
          "id" serial PRIMARY KEY NOT NULL,
          "conversation_id" integer NOT NULL,
          "role" varchar(20) NOT NULL,
          "content" text NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        );
      `);
      this.tablesInitialized = true;
    } catch (err) {
      console.error("ZenlecsAIService: Failed to ensure tables exist", err);
    }
  }

  public async getAvailableModels(): Promise<AIModelInfo[]> {
    const rotationNote = "Her iki promptta bir sıradaki modele geçilir.";
    const hasKey = Boolean(process.env.GROQ_API_KEY?.trim());
    return [
      {
        id: "qwen/qwen3.8-27b",
        name: "Qwen 3.8 27B (Groq)",
        description: `Dengeli akıl yürütme modeli. ${rotationNote}`,
        status: hasKey ? "active" : "needs_key",
        provider: "groq",
        isDefault: false,
      },
      {
        id: "openai/gpt-oss-120b",
        name: "GPT-OSS 120B (Groq LPU)",
        description: `120 Milyar parametreli yüksek kapasiteli hukuk ve mantık modeli. ${rotationNote}`,
        status: hasKey ? "active" : "needs_key",
        provider: "groq",
        isDefault: true,
      },
    ];
  }

  public async streamChatResponse(
    model: string,
    history: ChatMessageInput[],
    onChunk: (chunk: string) => void,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    await this.ensureTablesExist();
    if (!this.groqClient) {
      this.initGroqClient();
    }
    if (!this.groqClient) {
      throw new Error("Yapay zeka servisi kimlik doğrulaması başarısız. API anahtarını denetleyin.");
    }

    const selectedModel = resolveAIModel(model);
    const signal = options?.signal;

    const systemPrompt: ChatMessageInput = {
      role: "system",
      content: `Sen Zenlecs OS yazılımının yerleşik ve yetkili yapay zeka asistanı Zenlecs+'sın.
Türkiye hukuk sistemi (HMK, TBK, TTK, CMK, İİK, Avukatlık Kanunu, TBB Meslek Kuralları) ve kurumsal dosya yönetimi konusunda en üst düzey uzmanlığa sahipsin.
Ayrıca Zenlecs OS ekosisteminin tüm modüllerine (Studio Universal Legal Canvas, E-Wallet, Sunumlar, İletişim, Muhasebe ve Zenium Browser) ve ileride kazanılacak agentic çalışma yeteneklerine tam hakimsin.

Üslup ve Tasarım İlkeleri:
1. Asla yapay zeka klişesi ("Harika bir soru!", "Size yardımcı olmaktan mutluluk duyarım!", vb.) veya gereksiz dolgu cümleleri KULLANMA.
2. Doğrudan, vakur, yetkin, berrak ve net bir hukuk ve iş diliyle yaz.
3. Apple editoryal tasarım ilkelerine uy: Metni gereksiz kutular, süsler olmadan; net başlıklar (###), anlaşılır paragraflar ve temiz maddeler halinde çıplak ve okunabilir formatta sun.
4. Karmaşık görevlerde adımları mantıksal sırayla netleştirerek agentic bir plan sun.`,
    };

    const messagesToSend = [
      systemPrompt,
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Bu çağrıda istemciye en az bir parça gitti mi (yedeğe düşme kararı için)
    let emittedAny = false;
    const emitChunk = (chunk: string) => {
      emittedAny = true;
      onChunk(chunk);
    };

    /** Tek bir modeli akıtır ve üretilen tam metni döner. */
    const runStream = async (targetModel: string): Promise<string> => {
      if (signal?.aborted) throw new Error("İstek iptal edildi.");

      const stream = await this.groqClient!.chat.completions.create(
        {
          model: targetModel,
          messages: messagesToSend as any,
          stream: true,
          temperature: 0.3,
          max_tokens: MODEL_MAX_COMPLETION[targetModel] ?? 4096,
        },
        signal ? { signal } : undefined
      );

      let content = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          content += delta;
          emitChunk(delta);
        }
      }
      return content;
    };

    try {
      return await runStream(selectedModel);
    } catch (err: any) {
      console.error(`Groq streaming error with ${selectedModel}:`, err);

      // Yedek modele yalnızca hiç parça gönderilmediyse düş; aksi hâlde aynı
      // yanıtı iki kez akıtmış oluruz.
      if (!emittedAny && !signal?.aborted && selectedModel !== FALLBACK_AI_MODEL) {
        try {
          return await runStream(FALLBACK_AI_MODEL);
        } catch (fallbackErr) {
          console.error("Groq fallback error:", fallbackErr);
        }
      }

      throw err;
    }
  }
}

export const zenlecsAI = new ZenlecsAIService();
