declare global {
  interface Window {
    /** Electron window role: launcher keeps auth; app is post-login product UI */
    zenosWindowRole?: "launcher" | "app";
    electron?: {
      send: (channel: string, data?: any) => void;
      receive: (channel: string, func: (...args: any[]) => void) => void;
      removeListener: (channel: string, func: (...args: any[]) => void) => void;
      invoke: (channel: string, data?: any) => Promise<any>;
      /** Akışlı (SSE) istek: başlıklar gelince çözülür, gövde olaylarla akar. */
      stream?: (options: {
        streamId: string;
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: any;
      }) => Promise<{
        ok: boolean;
        status: number;
        headers: Record<string, string | string[]>;
        streamed: boolean;
        body?: string | Uint8Array;
        isBinary?: boolean;
        error?: string;
      }>;
      /** Devam eden akışı iptal eder. */
      abortStream?: (streamId: string) => Promise<any>;
      /** Akış olaylarını dinler; abonelikten çıkma fonksiyonu döner. */
      onStreamEvent?: (
        listener: (payload: { streamId: string; type: string; chunk?: string; error?: string }) => void
      ) => () => void;
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: any;
    }
  }
}

export {};
