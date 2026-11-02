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

/** Ses turu tek modelde kalır. Yazılı sohbetin iki promptta bir dönüşümü burada yok. */
export const VOICE_AI_MODEL = DEFAULT_AI_MODEL;
const VOICE_FIRST_TOKEN_MS = 2500;

export const VOICE_SYSTEM_PROMPT = `Sen Zenlecs OS içindeki Zenlecs+'sın. Kullanıcı seninle sesli, karşılıklı konuşuyor.
Kurallar:
1. Konuşulan Türkçe kullan. İki ila dört cümle kur.
2. Markdown, başlık, madde işareti, kod ve tablo kullanma.
3. Yapay zeka klişesi ve dolgu cümlesi kullanma.
4. Doğrudan, vakur ve net ol.
5. Hukuki konuda genel bilgi ver; kesin hukuki mütalaa iddiasında bulunma.`;

const TEXT_SYSTEM_PROMPT = `Sen Zenlecs OS yazılımının yerleşik ve yetkili yapay zeka asistanı Zenlecs+'sın.
Türkiye hukuk sistemi (HMK, TBK, TTK, CMK, İİK, Avukatlık Kanunu, TBB Meslek Kuralları) ve kurumsal dosya yönetimi konusunda en üst düzey uzmanlığa sahipsin.
Ayrıca Zenlecs OS ekosisteminin tüm modüllerine (Studio Universal Legal Canvas, E-Wallet, Sunumlar, İletişim, Muhasebe ve Zenium Browser) ve ileride kazanılacak agentic çalışma yeteneklerine tam hakimsin.

Üslup ve Tasarım İlkeleri:
1. Asla yapay zeka klişesi ("Harika bir soru!", "Size yardımcı olmaktan mutluluk duyarım!", vb.) veya gereksiz dolgu cümleleri KULLANMA.
2. Doğrudan, vakur, yetkin, berrak ve net bir hukuk ve iş diliyle yaz.
3. Apple editoryal tasarım ilkelerine uy: Metni gereksiz kutular, süsler olmadan; net başlıklar (###), anlaşılır paragraflar ve temiz maddeler halinde çıplak ve okunabilir formatta sun.
4. Karmaşık görevlerde adımları mantıksal sırayla netleştirerek agentic bir plan sun.`;

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

  public async transcribeSpeech(audio: Buffer): Promise<string> {
    if (!this.groqClient) this.initGroqClient();
    if (!this.groqClient) {
      throw new Error("Yapay zeka servisi kimlik doğrulaması başarısız. API anahtarını denetleyin.");
    }
    if (audio.length < 800) return "";

    const file = new File([new Uint8Array(audio)], "speech.wav", { type: "audio/wav" });
    const result = await this.groqClient.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "tr",
      response_format: "json",
    });
    return (result.text || "").trim();
  }

  public async streamChatResponse(
    model: string,
    history: ChatMessageInput[],
    onChunk: (chunk: string) => void,
    options?: { signal?: AbortSignal; channel?: "text" | "voice" }
  ): Promise<string> {
    await this.ensureTablesExist();
    if (!this.groqClient) {
      this.initGroqClient();
    }
    if (!this.groqClient) {
      throw new Error("Yapay zeka servisi kimlik doğrulaması başarısız. API anahtarını denetleyin.");
    }

    const voice = options?.channel === "voice";
    const selectedModel = voice ? VOICE_AI_MODEL : resolveAIModel(model);
    const signal = options?.signal;

    const messagesToSend = [
      {
        role: "system" as const,
        content: voice ? VOICE_SYSTEM_PROMPT : TEXT_SYSTEM_PROMPT,
      },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Bu çağrıda istemciye en az bir parça gitti mi (yedeğe düşme kararı için)
    let emittedAny = false;
    const emitChunk = (chunk: string) => {
      emittedAny = true;
      onChunk(chunk);
    };

    /** Tek bir modeli akıtır ve üretilen tam metni döner. */
    const runStream = async (targetModel: string, runSignal?: AbortSignal): Promise<string> => {
      if (runSignal?.aborted) throw new Error("İstek iptal edildi.");

      const stream = await this.groqClient!.chat.completions.create(
        {
          model: targetModel,
          messages: messagesToSend as any,
          stream: true,
          temperature: voice ? 0.4 : 0.3,
          max_tokens: voice ? 400 : (MODEL_MAX_COMPLETION[targetModel] ?? 4096),
        },
        runSignal ? { signal: runSignal } : undefined
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

    const fallbackOnce = async (err: unknown): Promise<string> => {
      console.error(`Groq streaming error with ${selectedModel}:`, err);
      if (!emittedAny && !signal?.aborted && selectedModel !== FALLBACK_AI_MODEL) {
        try {
          return await runStream(FALLBACK_AI_MODEL, signal);
        } catch (fallbackErr) {
          console.error("Groq fallback error:", fallbackErr);
        }
      }
      throw err;
    };

    if (!voice) {
      try {
        return await runStream(selectedModel, signal);
      } catch (err) {
        return fallbackOnce(err);
      }
    }

    const slow = new AbortController();
    const onParentAbort = () => slow.abort();
    signal?.addEventListener("abort", onParentAbort);
    let timedOut = false;
    const timer = setTimeout(() => {
      if (!emittedAny) {
        timedOut = true;
        slow.abort();
      }
    }, VOICE_FIRST_TOKEN_MS);

    try {
      const text = await runStream(VOICE_AI_MODEL, slow.signal);
      clearTimeout(timer);
      return text;
    } catch (err) {
      clearTimeout(timer);
      if (signal?.aborted && !timedOut) throw err;
      return fallbackOnce(err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onParentAbort);
    }
  }
}

export const zenlecsAI = new ZenlecsAIService();
