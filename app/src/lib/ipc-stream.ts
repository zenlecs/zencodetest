/**
 * Electron IPC üzerinden gerçek akışlı (SSE) HTTP yanıtı.
 *
 * Masaüstü uygulamasında renderer doğrudan sunucuya bağlanamaz; istekler
 * preload köprüsü üzerinden main process'e gider. Tamponlu `api-request`
 * köprüsü tek seferlik yanıt döndürdüğü için `fetch` uyumlu bir gövde akışı
 * sunmaz. Bu modül, `api-stream` köprüsünden gelen parçaları gerçek bir
 * `ReadableStream`'e bağlar; böylece renderer tarafındaki kod tarayıcıdaki
 * davranışın aynısını görür (`response.ok`, `response.body.getReader()`).
 */

/** Ana process'in döndürdüğü akış açılış sonucu. */
export interface IpcStreamOpenResult {
  ok: boolean;
  status: number;
  headers: Record<string, string | string[]>;
  /** true → gövde olaylarla akıyor; false → gövde tamponlanmış olarak geldi. */
  streamed: boolean;
  body?: string | Uint8Array;
  isBinary?: boolean;
  error?: string;
}

export interface IpcStreamEvent {
  streamId: string;
  type: "chunk" | "end" | "error";
  chunk?: string;
  error?: string;
}

export interface IpcStreamBridge {
  stream: (options: {
    streamId: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }) => Promise<IpcStreamOpenResult>;
  abortStream: (streamId: string) => Promise<unknown> | void;
  onStreamEvent: (listener: (event: IpcStreamEvent) => void) => () => void;
}

/** Renderer'da kullanılan, tarayıcı `Response` arayüzünü taklit eden nesne. */
export interface BridgeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  body?: ReadableStream<Uint8Array> | null;
  isBinary?: boolean;
  text: () => Promise<string>;
  json: () => Promise<any>;
  blob: () => Promise<Blob>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  clone: () => BridgeResponse;
}

export interface IpcStreamRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export function createStreamId(): string {
  const globalCrypto = typeof crypto !== "undefined" ? crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }
  return `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toHeaderRecord(headers: Record<string, string | string[]>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === "set-cookie") continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else {
      result.set(key, value);
    }
  }
  return result;
}

function decodeText(payload: string | Uint8Array | undefined, isBinary?: boolean): string {
  if (payload === undefined) return "";
  if (isBinary && payload instanceof Uint8Array) return new TextDecoder().decode(payload);
  return typeof payload === "string" ? payload : new TextDecoder().decode(payload);
}

/** Tamponlanmış sonuçtan tarayıcı benzeri yanıt üretir. */
export function createBufferedBridgeResponse(result: IpcStreamOpenResult): BridgeResponse {
  const wantsBinary = result.isBinary === true && result.body instanceof Uint8Array;
  const text = result.error
    ? JSON.stringify({ error: result.error })
    : decodeText(result.body, result.isBinary);

  const response: BridgeResponse = {
    ok: result.error ? false : result.ok,
    status: result.error && !result.status ? 500 : result.status,
    statusText: result.ok ? "OK" : "Error",
    headers: toHeaderRecord(result.headers),
    body: null,
    isBinary: wantsBinary,
    text: async () => text,
    json: async () => {
      if (!text) throw new Error("Unexpected end of JSON input");
      return JSON.parse(text);
    },
    blob: async () => new Blob([wantsBinary ? (result.body as Uint8Array) : text]),
    arrayBuffer: async () =>
      wantsBinary
        ? (result.body as Uint8Array).buffer.slice(0, (result.body as Uint8Array).byteLength)
        : new TextEncoder().encode(text).buffer,
    clone: () => response,
  };

  return response;
}

/**
 * SSE isteğini başlatır ve canlı gövde akışına sahip bir yanıt döndürür.
 * Yanıt başlıkları/kodu gelir gelmez söz çözülür; parçalar akmaya devam eder.
 */
export async function openIpcStream(
  bridge: IpcStreamBridge,
  request: IpcStreamRequest,
  signal?: AbortSignal | null
): Promise<BridgeResponse> {
  if (signal?.aborted) {
    throw new DOMException("İstek iptal edildi.", "AbortError");
  }

  const streamId = createStreamId();
  const open = await bridge.stream({ ...request, streamId });

  if (!open.streamed) {
    return createBufferedBridgeResponse(open);
  }

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let finished = false;
  let unsubscribe: () => void = () => {};

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      finished = true;
      unsubscribe();
      void bridge.abortStream(streamId);
    },
  });

  const handleAbort = () => {
    if (finished) return;
    finished = true;
    unsubscribe();
    void bridge.abortStream(streamId);
    try {
      controller?.error(new DOMException("İstek iptal edildi.", "AbortError"));
    } catch {
      // kuyu zaten kapanmış olabilir
    }
  };

  signal?.addEventListener("abort", handleAbort);

  // Açılış beklenirken iptal edildiyse akışı hemen kapat.
  if (signal?.aborted) {
    handleAbort();
    return {
      ok: open.ok,
      status: open.status,
      statusText: open.ok ? "OK" : "Error",
      headers: toHeaderRecord(open.headers),
      body,
      isBinary: false,
      text: async () => {
        throw new DOMException("İstek iptal edildi.", "AbortError");
      },
      json: async () => {
        throw new DOMException("İstek iptal edildi.", "AbortError");
      },
      blob: async () => {
        throw new DOMException("İstek iptal edildi.", "AbortError");
      },
      arrayBuffer: async () => {
        throw new DOMException("İstek iptal edildi.", "AbortError");
      },
      clone: function (this: BridgeResponse) {
        return this;
      },
    };
  }

  unsubscribe = bridge.onStreamEvent((event) => {
    if (event.streamId !== streamId || finished) return;

    if (event.type === "chunk") {
      if (!event.chunk) return;
      try {
        controller?.enqueue(encoder.encode(event.chunk));
      } catch {
        // kuyu kapanmışsa parçayı yut
      }
      return;
    }

    finished = true;
    unsubscribe();
    signal?.removeEventListener("abort", handleAbort);

    if (event.type === "error") {
      try {
        controller?.error(new Error(event.error || "Akış beklenmedik şekilde kesildi."));
      } catch {
        // kuyu zaten hata durumunda
      }
      return;
    }

    try {
      controller?.close();
    } catch {
      // kuyu zaten kapanmış
    }
  });

  return {
    ok: open.ok,
    status: open.status,
    statusText: open.ok ? "OK" : "Error",
    headers: toHeaderRecord(open.headers),
    body,
    isBinary: false,
    text: async () => {
      throw new Error("Akışlı yanıt metin olarak okunamaz.");
    },
    json: async () => {
      throw new Error("Akışlı yanıt JSON olarak okunamaz.");
    },
    blob: async () => {
      throw new Error("Akışlı yanıt blob olarak okunamaz.");
    },
    arrayBuffer: async () => {
      throw new Error("Akışlı yanıt ArrayBuffer olarak okunamaz.");
    },
    clone: function (this: BridgeResponse) {
      return this;
    },
  };
}
