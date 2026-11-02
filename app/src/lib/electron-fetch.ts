import { openIpcStream, type IpcStreamBridge } from "./ipc-stream";

/**
 * Electron IPC fetch polyfill.
 *
 * Masaüstü uygulamasında renderer doğrudan sunucuya bağlanamaz: tüm `/api/...`
 * istekleri preload köprüsü üzerinden main process'e taşınır. Bu polyfill
 * tarayıcı `fetch` davranışını birebir korur:
 *   - Gövde hazırlığı (JSON, FormData, Blob, ArrayBuffer)
 *   - CSRF başlığı ve oturum cookie'lerinin eklenmesi
 *   - Set-Cookie yanıtlarının işlenmesi (HttpOnly cookie'ler bellekde tutulur)
 *   - `x-zenos-stream: 1` ile işaretlenen SSE isteklerinde gerçek gövde akışı
 */

/** Akış (SSE) isteklerini işaretleyen başlık. */
export const STREAM_HEADER = "x-zenos-stream";
const CSRF_COOKIE_NAME = "zenos_csrf";

export interface ElectronFetchOptions {
  /** Test edilebilirlik için enjekte edilebilir fetch (varsayılan: window.fetch). */
  originalFetch?: typeof fetch;
  /** Test edilebilirlik için enjekte edilebilir pencere (varsayılan: window). */
  targetWindow?: Window & typeof globalThis;
}

/** HttpOnly cookie'ler bellekde tutulur (document.cookie onları göstermez). */
const internalCookies: Record<string, string> = {};

export function clearInternalCookies(): void {
  for (const key of Object.keys(internalCookies)) delete internalCookies[key];
}

export function installElectronFetchPolyfill(options: ElectronFetchOptions = {}): void {
  const target = options.targetWindow ?? (typeof window !== "undefined" ? window : undefined);
  if (!target) return;

  target.addEventListener("error", (e: ErrorEvent) => {
    console.error("[ZenOS Error]", e.error || e.message);
  });
  target.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    console.error("[ZenOS Unhandled Rejection]", e.reason);
  });

  // Oturum kapatıldığında bellekdeki cookie'ler de temizlenir.
  target.addEventListener("zenos-clear-session-cookies", () => clearInternalCookies());

  const originalFetch = options.originalFetch ?? target.fetch;

  target.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const electron = target.electron;
    if (!electron) return originalFetch(input, init);

    const url =
      typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
    if (!url.includes("/api/")) return originalFetch(input, init);

    const method = init?.method || "GET";

    // ---- Gövde hazırlığı -----------------------------------------------------
    let bodyData: any;
    if (init?.body) {
      if (typeof FormData !== "undefined" && init.body instanceof FormData) {
        const entries: Array<{ name: string; value: any; isFile: boolean; filename?: string; mimeType?: string }> = [];
        for (const [key, val] of (init.body as any).entries()) {
          if (val instanceof Blob || (typeof File !== "undefined" && val instanceof File)) {
            const buffer = await val.arrayBuffer();
            entries.push({
              name: key,
              value: new Uint8Array(buffer),
              isFile: true,
              filename: (val as any).name || "file",
              mimeType: val.type || "application/octet-stream",
            });
          } else {
            entries.push({ name: key, value: String(val), isFile: false });
          }
        }
        bodyData = { __isFormData: true, entries };
      } else if (typeof Blob !== "undefined" && init.body instanceof Blob) {
        bodyData = new Uint8Array(await init.body.arrayBuffer());
      } else if (init.body instanceof ArrayBuffer) {
        bodyData = new Uint8Array(init.body);
      } else if (typeof init.body === "string") {
        try {
          bodyData = JSON.parse(init.body);
        } catch {
          bodyData = init.body;
        }
      } else {
        bodyData = init.body;
      }
    }

    // ---- Başlıklar -----------------------------------------------------------
    const headers = { ...(init?.headers as Record<string, string> | undefined) } as Record<string, string>;

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase())) {
      const csrfToken = readCookie(target, CSRF_COOKIE_NAME) ?? internalCookies[CSRF_COOKIE_NAME] ?? null;
      if (csrfToken) headers["x-csrf-token"] = csrfToken;
    }

    // Oturum cookie'lerini başlığa ekle (kavanoz + HttpOnly bellek kopyası)
    const browserCookies = readAllCookies(target);
    const combinedCookies = { ...browserCookies, ...internalCookies };
    const cookieString = Object.entries(combinedCookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookieString) headers["cookie"] = cookieString;

    const parsedUrl = new URL(url, target.location.origin);
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;

    // ---- Akış (SSE) istekleri: gerçek gövde akışı ----------------------------
    const bridge = electron as unknown as Partial<IpcStreamBridge>;
    if (headerValue(headers, STREAM_HEADER) === "1" && typeof bridge.stream === "function") {
      delete headers[STREAM_HEADER];
      delete headers["X-Zenos-Stream"];

      return (await openIpcStream(
        bridge as IpcStreamBridge,
        { method, url: pathAndQuery, headers, body: bodyData },
        init?.signal ?? null
      )) as unknown as Response;
    }

    // ---- Tamponlu istek ------------------------------------------------------
    const response = await electron.invoke("api-request", {
      method,
      url: pathAndQuery,
      body: bodyData,
      headers,
    });

    // Set-Cookie yanıtlarını elle işle
    const setCookies = response.headers["set-cookie"];
    if (setCookies) {
      const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
      cookieArray.forEach((cookieStr: string) => {
        const [nameValue] = cookieStr.split(";");
        const separator = nameValue.indexOf("=");
        if (separator <= 0) return;
        const key = nameValue.slice(0, separator).trim();
        const value = nameValue.slice(separator + 1).trim();

        internalCookies[key] = value;
        if (!cookieStr.toLowerCase().includes("httponly")) {
          target.document.cookie = cookieStr;
        }
      });
    }

    return createBufferedResponse(response);
  };
}

function headerValue(headers: Record<string, string>, name: string): string | null {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : null;
}

function readAllCookies(target: Window & typeof globalThis): Record<string, string> {
  const cookieString = target.document?.cookie;
  if (!cookieString) return {};
  return cookieString.split("; ").reduce((acc, entry) => {
    const separator = entry.indexOf("=");
    if (separator <= 0) return acc;
    acc[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim();
    return acc;
  }, {} as Record<string, string>);
}

function readCookie(target: Window & typeof globalThis, name: string): string | null {
  const cookies = readAllCookies(target);
  return name in cookies ? decodeURIComponent(cookies[name]) : null;
}

/** Köprüden dönen tamponlu yanıtı tarayıcı `Response` benzeri nesneye çevirir. */
function createBufferedResponse(response: any): Response {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.status >= 200 && response.status < 300 ? "OK" : "Error",
    headers: new Headers(response.headers as any),
    text: async () => {
      if (response.isBinary && response.body) {
        return new TextDecoder().decode(response.body);
      }
      return response.body || "";
    },
    json: async () => {
      const raw = response.isBinary && response.body
        ? new TextDecoder().decode(response.body)
        : response.body;
      if (!raw) throw new Error("Unexpected end of JSON input");
      return JSON.parse(raw);
    },
    blob: async () => {
      if (response.isBinary && response.body) {
        const mime = (response.headers["content-type"] || "application/octet-stream").split(";")[0];
        return new Blob([response.body], { type: mime });
      }
      return new Blob([response.body]);
    },
    arrayBuffer: async () => {
      if (response.isBinary && response.body) {
        const uint8 = response.body as Uint8Array;
        return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
      }
      return new TextEncoder().encode(response.body).buffer;
    },
    clone: function (this: Response) {
      return this;
    },
  } as any as Response;
}
