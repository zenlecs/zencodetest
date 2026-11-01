import { createContext, useContext, ReactNode, useRef, useCallback, useEffect } from "react";
import { useWebSocket as useWebSocketHook, ChatMessage, CallSignalEvent } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { getNotificationRenderer } from "@/lib/notification-registry";

interface WebSocketContextType {
  isConnected: boolean;
  onlineUsers: number[];
  sendMessage: (conversationId: number, targetUserId: string, content: string, type: string, fileData?: string, audioDuration?: number, replyToId?: number, attachmentUrl?: string, attachmentType?: string) => void;
  sendTyping: (conversationId: number, isTyping: boolean) => void;
  sendCallSignal: (type: "offer" | "answer" | "ice-candidate" | "call-end" | "call-reject", targetUserId: number, conversationId: number, data: any) => void;
  addMessageListener: (listener: (msg: ChatMessage) => void) => void;
  removeMessageListener: (listener: (msg: ChatMessage) => void) => void;
  addCallSignalListener: (listener: (event: CallSignalEvent) => void) => void;
  removeCallSignalListener: (listener: (event: CallSignalEvent) => void) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const messageListenersRef = useRef<Set<(msg: ChatMessage) => void>>(new Set());
  const callSignalListenersRef = useRef<Set<(event: CallSignalEvent) => void>>(new Set());

  const { toast } = useToast();

  const handleMessage = useCallback((msg: ChatMessage) => {
    messageListenersRef.current.forEach(listener => listener(msg));
  }, []);

  const handleCallSignal = useCallback((event: CallSignalEvent) => {
    callSignalListenersRef.current.forEach(listener => listener(event));
  }, []);

  const handleNotification = useCallback((notification: any) => {
    const renderer = getNotificationRenderer(notification.type);
    toast({
      title: notification.title,
      description: notification.message,
      duration: 5000,
      className: "border-l-4 border-l-primary",
    });
  }, [toast]);

  const { isConnected, onlineUsers, sendMessage, sendTyping, sendCallSignal } = useWebSocketHook({
    onMessage: handleMessage,
    onCallSignal: handleCallSignal,
    onNotification: handleNotification,
  });

  const addMessageListener = useCallback((listener: (msg: ChatMessage) => void) => {
    messageListenersRef.current.add(listener);
  }, []);

  const removeMessageListener = useCallback((listener: (msg: ChatMessage) => void) => {
    messageListenersRef.current.delete(listener);
  }, []);

  const addCallSignalListener = useCallback((listener: (event: CallSignalEvent) => void) => {
    callSignalListenersRef.current.add(listener);
  }, []);

  const removeCallSignalListener = useCallback((listener: (event: CallSignalEvent) => void) => {
    callSignalListenersRef.current.delete(listener);
  }, []);

  return (
    <WebSocketContext.Provider value={{
      isConnected,
      onlineUsers,
      sendMessage,
      sendTyping,
      sendCallSignal,
      addMessageListener,
      removeMessageListener,
      addCallSignalListener,
      removeCallSignalListener
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useGlobalWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error("useGlobalWebSocket must be used within WebSocketProvider");
  return context;
}

// Keep the old useWebSocket export for backwards compatibility, but alias the global one as useWebSocket in most files
export { useGlobalWebSocket as useWebSocket };
