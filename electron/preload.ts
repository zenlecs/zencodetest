import { contextBridge, ipcRenderer } from 'electron'

const windowRole = process.argv.includes('--zenos-window=app') ? 'app' : 'launcher';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('zenosWindowRole', windowRole);

contextBridge.exposeInMainWorld(
  'electron',
  {
    send: (channel: string, data: any) => {
      // whitelist channels
      let validChannels = [
        'window-min',
        'window-max',
        'window-close',
        'app-ready',
        'launch-main-app',
        'auth-login',
        'auth-logout',
        'check-for-updates',
        'download-update',
        'install-update',
        'detach-communication',
        'check-detached-state',
        'init-hidden-windows',
        'theme-sync',
        'payload-status',
        'payload-install'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel: string, func: Function) => {
      let validChannels = [
        'updater-status',
        'communication-window-closed',
        'communication-detached',
        'theme-updated',
        'auth-logged-out',
        'auth-session-ready',
        'payload-progress',
      ];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeListener: (channel: string, func: (...args: any[]) => void) => {
      let validChannels = [
        'updater-status',
        'communication-window-closed',
        'communication-detached',
        'theme-updated',
        'auth-logged-out',
        'auth-session-ready',
        'payload-progress',
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, func);
      }
    },
    invoke: async (channel: string, data: any) => {
      let validChannels = ['api-request', 'get-local-server-port', 'payload-status', 'payload-install'];
      if (validChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
      throw new Error(`Invalid IPC channel: ${channel}`);
    },

    /**
     * Akışlı (SSE) API isteği başlatır. Yanıt başlıkları gelir gelmez çözülür;
     * gövde parçaları ve bitiş `onStreamEvent` üzerinden bildirilir.
     */
    stream: async (options: {
      streamId: string;
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: any;
    }) => await ipcRenderer.invoke('api-stream', options),

    /** Devam eden bir akışı iptal eder. */
    abortStream: async (streamId: string) =>
      await ipcRenderer.invoke('api-stream-abort', { streamId }),

    /** Akış olaylarını (chunk/end/error) dinler; abonelikten çıkma fonksiyonu döner. */
    onStreamEvent: (listener: (payload: { streamId: string; type: string; chunk?: string; error?: string }) => void) => {
      const handler = (
        _event: unknown,
        payload: { streamId: string; type: string; chunk?: string; error?: string }
      ) => listener(payload);
      ipcRenderer.on('api-stream-event', handler);
      return () => ipcRenderer.removeListener('api-stream-event', handler);
    }
  }
)
