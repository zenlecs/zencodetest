/**
 * Zenlecs+ sohbet akışı yardımcıları.
 *
 * Sunucu yanıtları SSE (text/event-stream) olarak gönderilir. Ancak masaüstü
 * uygulamasında istekler Electron IPC köprüsünden (main.tsx fetch polyfill)
 * geçer; bu köprü yanıtı tamponlar ve gerçek bir `body` akışı sunmaz.
 * Bu yüzden iki taşıma biçimi de desteklenir:
 *   1. Gerçek akış: `response.body.getReader()` ile parça parça okuma.
 *   2. Tamponlu taşıma: gövdenin tamamı tek seferde gelir, SSE blokları
 *      ayrıştırılarak aynı olaylar üretilir.
 */

export type ChatStreamEvent =
  | { type: "meta"; conversationId: number; model?: string }
  | { type: "chunk"; chunk: string }
  | { type: "done" }
  | { type: "error"; error?: string };

export type ChatStreamEmit = (event: ChatStreamEvent) => void | Promise<void>;

/** fetch/Electron IPC yanıtları için gereken asgari arayüz. */
export interface ChatStreamResponse {
  ok: boolean;
  status?: number;
  body?: ReadableStream<Uint8Array> | null;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

/**
 * Başarısız (ok=false) yanıtı kullanıcıya gösterilecek sade mesaja çevirir.
 * Sunucunun `error`/`message` alanı önceliklidir; gövde JSON değilse durum
 * kodu ile birlikte genel bir mesaj döner.
 */
export async function describeChatFailure(response: ChatStreamResponse): Promise<string> {
  const status = typeof response.status === "number" ? response.status : 0;

  try {
    const payload = await response.json();
    const serverMessage = payload?.error ?? payload?.message;
    if (serverMessage) {
      return Array.isArray(serverMessage) ? serverMessage.join(", ") : String(serverMessage);
    }
  } catch {
    try {
      const text = (await response.text()).trim();
      if (text && text.length <= 200 && !text.startsWith("<")) return text;
    } catch {
      // Gövde okunamıyorsa genel mesajda kal
    }
  }

  return status
    ? `Sohbet isteği tamamlanamadı (HTTP ${status}).`
    : "Sohbet isteği tamamlanamadı.";
}

const SSE_EVENT_SEPARATOR = "\n\n";
const SSE_DATA_PREFIX = "data: ";

/** Tek bir SSE bloğunu ("data: {...}") ayrıştırıp olaya dönüştürür. */
export function parseSseBlock(block: string): ChatStreamEvent | null {
  if (!block.startsWith(SSE_DATA_PREFIX)) return null;
  const jsonStr = block.slice(SSE_DATA_PREFIX.length).trim();
  if (!jsonStr) return null;

  try {
    const data = JSON.parse(jsonStr);
    if (data.type === "meta" && data.conversationId) {
      return {
        type: "meta",
        conversationId: Number(data.conversationId),
        ...(data.model ? { model: String(data.model) } : {}),
      };
    }
    if (data.type === "chunk" && data.chunk) {
      return { type: "chunk", chunk: String(data.chunk) };
    }
    if (data.type === "done") {
      return { type: "done" };
    }
    if (data.type === "error") {
      return { type: "error", error: data.error };
    }
  } catch {
    // Yarım kalan / bozuk olayı yut
  }
  return null;
}

/** Ham SSE gövdesinin tamamını (tamponlu taşıma) olaylara çevirir. */
export async function emitSsePayload(payload: string, emit: ChatStreamEmit): Promise<void> {
  for (const block of payload.split(SSE_EVENT_SEPARATOR)) {
    const event = parseSseBlock(block);
    if (event) await deliverEvent(event, emit);
  }
}

/**
 * Olayı dinleyiciye iletir; sunucu `error` olayı gönderdiyse akışı reddeder.
 * Böylece hata ayrıca ele alınmayı unutulsa bile sessizce yutulmaz.
 */
async function deliverEvent(event: ChatStreamEvent, emit: ChatStreamEmit): Promise<void> {
  await emit(event);
  if (event.type === "error") {
    throw new Error(event.error || "Yanıt üretilirken hata oluştu.");
  }
}

/**
 * Sohbet yanıtını tüketir ve her olayı `emit` ile bildirir.
 * Akış desteklenmiyorsa (Electron IPC köprüsü) tamponlu gövdeyi ayrıştırır.
 */
export async function consumeChatStream(
  response: ChatStreamResponse,
  emit: ChatStreamEmit
): Promise<void> {
  const reader =
    response.body && typeof (response.body as ReadableStream<Uint8Array>).getReader === "function"
      ? response.body.getReader()
      : null;

  if (!reader) {
    await emitSsePayload(await response.text(), emit);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(SSE_EVENT_SEPARATOR);
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) await deliverEvent(event, emit);
    }
  }

  const trailing = parseSseBlock(buffer);
  if (trailing) await deliverEvent(trailing, emit);
}
