/**
 * ZenOS loopback API köprüsü (main process).
 *
 * Renderer'daki `window.fetch` polyfill'i tüm `/api/...` isteklerini buradan
 * geçirir. İki taşıma biçimi vardır:
 *
 *  - `executeRequest`: yanıt tamamen tamponlanır (JSON, dosya, HTML...).
 *  - `executeStreamingRequest`: `text/event-stream` yanıtları okunurken parça
 *    parça renderer'a aktarılır; böylece tarayıcıdaki gerçek `body` akışı
 *    masaüstü uygulamasında da birebir çalışır.
 *
 * Modül bilinçli olarak electron'a bağımlı değildir (yalnızca fetch/AbortController
 * kullanır), böylece Node üzerinde doğrudan test edilebilir.
 */

export interface BridgeRequestOptions {
  /** HTTP metodu */
  method: string;
  /** Path + query, ör. "/api/ai/chat/stream" */
  url: string;
  /** Renderer'dan gelen ham başlıklar */
  headers?: Record<string, unknown>;
  /** Oturum kavanozu ile birleştirilmiş cookie başlığı */
  cookieHeader?: string;
  /** Normalize edilmemiş gövde (obje, string, Uint8Array, FormData tanımı) */
  body?: unknown;
  /** Ör. "http://127.0.0.1:51405" */
  baseUrl: string;
  /** Her istekte zorunlu loopback bearer token'ı */
  token: string;
  signal?: AbortSignal;
}

export interface BridgeResponseBase {
  ok: boolean;
  status: number;
  headers: Record<string, string | string[]>;
}

export interface BufferedBridgeResult extends BridgeResponseBase {
  body: string | Uint8Array;
  isBinary: boolean;
}

export interface StreamingBridgeResult extends BridgeResponseBase {
  /** Gövde SSE olarak parça parça aktarıldı mı */
  streamed: boolean;
  /** SSE değilse tamponlanmış gövde */
  body?: string | Uint8Array;
  isBinary?: boolean;
  /** Taşıma seviyesinde hata (bağlantı koptu, iptal edildi...) */
  error?: string;
}

/** Akış kuyusunun geri çağrıları. */
export interface StreamHandlers {
  onChunk: (chunk: string) => void;
  /** Akış bittiğinde (veya koptuğunda) bir kez çağrılır. */
  onEnd: (error?: string) => void;
}

const SSE_CONTENT_TYPE = "text/event-stream";
const JSON_CONTENT_TYPE = "application/json";
const BINARY_OMITTED_CONTENT_TYPES = [
  JSON_CONTENT_TYPE,
  "text/",
  "application/javascript",
  "application/xml",
];

/** Yanıt gövdesini metin mi yoksa ikili veri mi olarak okuyacağımıza karar verir. */
export function isBinaryContentType(contentType: string): boolean {
  return !BINARY_OMITTED_CONTENT_TYPES.some((allowed) => contentType.includes(allowed));
}

/** Node fetch `getSetCookie` desteklemiyorsa tekil başlıktan liste üretir. */
export function extractSetCookies(headers: Headers): string[] | undefined {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    const list = anyHeaders.getSetCookie();
    if (list && list.length > 0) return list;
  }
  const single = headers.get("set-cookie");
  return single ? [single] : undefined;
}

/** Yanıt başlıklarını renderer'a taşınabilir düz nesneye çevirir. */
export function serializeHeaders(headers: Headers): Record<string, string | string[]> {
  const serialized: Record<string, string | string[]> = {};
  headers.forEach((value, key) => {
    serialized[key] = value;
  });
  const setCookies = extractSetCookies(headers);
  if (setCookies) serialized["set-cookie"] = setCookies;
  return serialized;
}

/**
 * Renderer'dan gelen başlıkları temizler; güvenlik açısından renderer'ın
 * Authorization/Origin değerleri asla kullanılmaz, köprü bunları kendisi yazar.
 */
export function buildBridgeHeaders(
  rawHeaders: Record<string, unknown> | undefined,
  token: string,
  cookieHeader?: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (rawHeaders && typeof rawHeaders === "object") {
    for (const [key, value] of Object.entries(rawHeaders)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "authorization" || lowerKey === "origin" || lowerKey === "cookie") {
        continue;
      }
      if (value === undefined || value === null) continue;
      headers[key] = String(value);
    }
  }

  headers["Authorization"] = `Bearer ${token}`;
  headers["Origin"] = "zenos-electron";
  if (cookieHeader) headers["cookie"] = cookieHeader;
  mirrorCsrfHeader(headers);

  return headers;
}

function mirrorCsrfHeader(headers: Record<string, string>) {
  const hasHeader = Object.keys(headers).some((key) => key.toLowerCase() === "x-csrf-token");
  if (hasHeader) return;
  const cookie = Object.entries(headers).find(([key]) => key.toLowerCase() === "cookie")?.[1];
  if (!cookie) return;
  const pair = cookie.split(";").map((part) => part.trim()).find((part) => part.toLowerCase().startsWith("zenos_csrf="));
  if (!pair) return;
  headers["x-csrf-token"] = decodeURIComponent(pair.slice("zenos_csrf=".length));
}

/**
 * Gövdeyi fetch'in kabul ettiği biçime çevirir.
 * FormData tanımları ve ikili veriler için Content-Type başlığı düzeltilir.
 */
export function prepareRequestBody(
  rawBody: unknown,
  method: string,
  headers: Record<string, string>
): BodyInit | undefined {
  const upperMethod = (method || "GET").toUpperCase();
  if (rawBody === undefined || rawBody === null || upperMethod === "GET" || upperMethod === "HEAD") {
    return undefined;
  }

  const formDataPayload = rawBody as { __isFormData?: boolean; entries?: Array<{ name: string; value: any; isFile?: boolean; filename?: string; mimeType?: string }> };
  if (formDataPayload.__isFormData && Array.isArray(formDataPayload.entries)) {
    const form = new FormData();
    for (const entry of formDataPayload.entries) {
      if (entry.isFile && entry.value) {
        const blob = new Blob([Buffer.from(entry.value)], {
          type: entry.mimeType || "application/octet-stream",
        });
        form.append(entry.name, blob, entry.filename || "file");
      } else {
        form.append(entry.name, String(entry.value));
      }
    }
    // Node fetch multipart sınırını (boundary) kendisi ekler.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-type") delete headers[key];
    }
    return form;
  }

  if (typeof rawBody === "string") return rawBody;
  if (rawBody instanceof Uint8Array || Buffer.isBuffer(rawBody)) return rawBody as BodyInit;
  if (typeof Blob !== "undefined" && rawBody instanceof Blob) return rawBody;
  if (typeof FormData !== "undefined" && rawBody instanceof FormData) return rawBody;

  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = JSON_CONTENT_TYPE;
  }
  return JSON.stringify(rawBody);
}

async function readBody(response: Response, contentType: string): Promise<{ body: string | Uint8Array; isBinary: boolean }> {
  if (isBinaryContentType(contentType)) {
    const buffer = await response.arrayBuffer();
    return { body: new Uint8Array(buffer), isBinary: true };
  }
  return { body: await response.text(), isBinary: false };
}

function toErrorResult(error: unknown): BufferedBridgeResult {
  return {
    ok: false,
    status: 500,
    headers: {},
    body: JSON.stringify({
      error: "API köprüsü isteği tamamlanamadı.",
      message: error instanceof Error ? error.message : String(error),
    }),
    isBinary: false,
  };
}

/** Tamponlu istek: yanıtın tamamı tek seferde döner. */
export async function executeRequest(options: BridgeRequestOptions): Promise<BufferedBridgeResult> {
  try {
    const headers = buildBridgeHeaders(options.headers, options.token, options.cookieHeader);
    const body = prepareRequestBody(options.body, options.method, headers);

    const response = await fetch(`${options.baseUrl}${options.url}`, {
      method: options.method,
      headers,
      body,
      signal: options.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const { body: responseBody, isBinary } = await readBody(response, contentType);

    return {
      ok: response.ok,
      status: response.status,
      headers: serializeHeaders(response.headers),
      body: responseBody,
      isBinary,
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

/**
 * Akış isteği: yanıt başlıkları gelir gelmez döner, `text/event-stream`
 * gövdesi arka planda okunup `handlers.onChunk` ile iletilir.
 *
 * Bu sayede renderer, gerçek tarayıcıdaki gibi `response.ok`/`status`
 * bilgisine hemen sahip olur ve gövdeyi akan bir `ReadableStream` olarak alır.
 */
export async function openStreamingRequest(
  options: BridgeRequestOptions,
  handlers: StreamHandlers
): Promise<StreamingBridgeResult> {
  let response: Response;
  try {
    const headers = buildBridgeHeaders(options.headers, options.token, options.cookieHeader);
    const body = prepareRequestBody(options.body, options.method, headers);

    response = await fetch(`${options.baseUrl}${options.url}`, {
      method: options.method,
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      headers: {},
      streamed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const serialized = serializeHeaders(response.headers);

  if (!response.ok || !contentType.includes(SSE_CONTENT_TYPE) || !response.body) {
    const { body: buffered, isBinary } = await readBody(response, contentType);
    return {
      ok: response.ok,
      status: response.status,
      headers: serialized,
      streamed: false,
      body: buffered,
      isBinary,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) handlers.onChunk(decoder.decode(value, { stream: true }));
      }
      const tail = decoder.decode();
      if (tail) handlers.onChunk(tail);
      handlers.onEnd();
    } catch (error) {
      const aborted = options.signal?.aborted === true;
      handlers.onEnd(
        aborted ? "Akış iptal edildi." : error instanceof Error ? error.message : String(error)
      );
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // okuyucu zaten bırakılmış olabilir
      }
    }
  })();

  return {
    ok: true,
    status: response.status,
    headers: serialized,
    streamed: true,
  };
}

/* -------------------------------------------------------------------------- */
/* IPC kaydı                                                                  */
/* -------------------------------------------------------------------------- */

/** `ipcMain` ve `webContents` için gereken asgari arayüzler (electron importu yok). */
export interface WebContentsLike {
  isDestroyed: () => boolean;
  send: (channel: string, payload: unknown) => void;
}

export interface IpcMainLike {
  handle: (channel: string, listener: (event: { sender: WebContentsLike }, options: any) => Promise<unknown>) => void;
}

export interface SandboxBridgeDeps {
  /** Renderer'a hizmet veren loopback sunucunun taban adresi. */
  getBaseUrl: () => Promise<string>;
  /** Her isteğe eklenen bearer token. */
  token: string;
  /** Renderer'dan gelen cookie başlığını oturum kavanozuyla birleştirir. */
  resolveCookie?: (headers: unknown) => string | undefined;
  /** Yanıt Set-Cookie başlıklarını paylaşımlı kavanoza işler. */
  onSetCookies?: (setCookies: string | string[] | undefined) => void;
  /** Hata ayıklama günlüğü. */
  onError?: (scope: string, error: unknown) => void;
}

export const API_REQUEST_CHANNEL = "api-request";
export const API_STREAM_CHANNEL = "api-stream";
export const API_STREAM_ABORT_CHANNEL = "api-stream-abort";
export const API_STREAM_EVENT_CHANNEL = "api-stream-event";

/**
 * Renderer'a açılan tüm API kanallarını kaydeder: tamponlu istek, akış (SSE)
 * ve akış iptali. Electron main process'i bu fonksiyonu bir kez çağırır.
 */
export function registerSandboxApiIpc(ipcMain: IpcMainLike, deps: SandboxBridgeDeps): void {
  const activeStreams = new Map<string, AbortController>();
  const reportError = (scope: string, error: unknown) =>
    deps.onError ? deps.onError(scope, error) : undefined;

  ipcMain.handle(API_REQUEST_CHANNEL, async (_event, options) => {
    try {
      const baseUrl = await deps.getBaseUrl();
      const result = await executeRequest({
        method: options?.method || "GET",
        url: options?.url,
        headers: options?.headers,
        cookieHeader: deps.resolveCookie?.(options?.headers),
        body: options?.body,
        baseUrl,
        token: deps.token,
      });

      deps.onSetCookies?.(result.headers["set-cookie"]);
      return result;
    } catch (error) {
      reportError("api-request", error);
      return {
        ok: false,
        status: 500,
        headers: {},
        body: JSON.stringify({ message: "Internal Server Error (IPC Bridge)" }),
        isBinary: false,
      };
    }
  });

  ipcMain.handle(API_STREAM_CHANNEL, async (event, options) => {
    const streamId = String(options?.streamId || "");
    if (!streamId) {
      return { ok: false, status: 0, headers: {}, streamed: false, error: "Eksik akış kimliği." };
    }

    try {
      const baseUrl = await deps.getBaseUrl();
      const controller = new AbortController();
      activeStreams.set(streamId, controller);
      const sender = event.sender;

      const emit = (payload: Record<string, unknown>) => {
        if (sender.isDestroyed()) return;
        sender.send(API_STREAM_EVENT_CHANNEL, { streamId, ...payload });
      };

      const result = await openStreamingRequest(
        {
          method: options?.method || "GET",
          url: options?.url,
          headers: options?.headers,
          cookieHeader: deps.resolveCookie?.(options?.headers),
          body: options?.body,
          baseUrl,
          token: deps.token,
          signal: controller.signal,
        },
        {
          onChunk: (chunk) => emit({ type: "chunk", chunk }),
          onEnd: (error) => {
            activeStreams.delete(streamId);
            emit(error ? { type: "error", error } : { type: "end" });
          },
        }
      );

      // Tamponlu sonuçta arka planda akan bir kuyu yok; kayıt hemen temizlenir.
      if (!result.streamed) activeStreams.delete(streamId);

      deps.onSetCookies?.(result.headers["set-cookie"]);
      return result;
    } catch (error) {
      reportError("api-stream", error);
      activeStreams.delete(streamId);
      return {
        ok: false,
        status: 500,
        headers: {},
        streamed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(API_STREAM_ABORT_CHANNEL, async (_event, payload) => {
    const streamId = String(payload?.streamId || "");
    const controller = activeStreams.get(streamId);
    if (!controller) return { aborted: false };
    activeStreams.delete(streamId);
    controller.abort();
    return { aborted: true };
  });
}
