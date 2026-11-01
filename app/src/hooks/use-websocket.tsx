import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";

export type WSMessageType = "message" | "typing" | "read" | "delivered" | "presence" | "call_signal" | "connected" | "error" | "notification";

export interface WSMessage {
  type: WSMessageType;
  payload?: any;
  message?: string;
  userId?: number;
  onlineUsers?: number[];
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderUsername?: string;
  content: string;
  contentEncrypted?: string;
  type: string;
  timestamp: string;
  createdAt?: string;
  isRead?: boolean;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  audioData?: string;
  audioDuration?: number;
  replyToId?: number;
  attachmentUrl?: string;
  attachmentType?: string;
}

export interface TypingEvent {
  userId: number;
  username: string;
  conversationId: number;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: number;
  status: "online" | "offline" | "away" | "busy";
}

export interface CallSignalEvent {
  type: "offer" | "answer" | "ice-candidate" | "call-end" | "call-reject" | "user_offline";
  fromUserId?: number;
  fromUsername?: string;
  targetUserId?: number;
  data?: any;
}

interface UseWebSocketOptions {
  onMessage?: (message: ChatMessage) => void;
  onTyping?: (event: TypingEvent) => void;
  onPresence?: (event: PresenceEvent) => void;
  onCallSignal?: (event: CallSignalEvent) => void;
  onRead?: (conversationId: number, messageIds: number[]) => void;
  onDelivered?: (conversationId: number, messageIds: number[]) => void;
  onNotification?: (notification: any) => void;
  onConnected?: (userId: number, onlineUsers: number[]) => void;
  onError?: (error: string) => void;
  onDisconnect?: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { user, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const optionsRef = useRef(options);
  const maxReconnectAttempts = 5;
  
  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(async () => {
    if (!isAuthenticated || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let wsUrl = `${protocol}//${window.location.host}/ws`;
    let subprotocols: string[] | undefined = undefined;

    if (window.electron) {
      try {
        const info = await window.electron.invoke("get-local-server-port");
        if (info && typeof info === "object" && info.port && info.token) {
          wsUrl = `ws://127.0.0.1:${info.port}/ws`;
          subprotocols = ["zenos.v1", `zenos-loopback.${info.token}`];
          
          // Request ephemeral ticket from authenticated server
          try {
            const ticketRes = await fetch("/api/auth/ws-ticket", { method: "POST" });
            if (ticketRes.ok) {
              const ticketData = await ticketRes.json();
              if (ticketData.ticket) {
                subprotocols.push(`zenos-ticket.${ticketData.ticket}`);
              }
            }
          } catch (tErr) {
            console.error("[WS] Ticket fetch error:", tErr);
          }
        }
      } catch (err) {
        console.error("[WS] Electron server info error:", err);
      }
    }

    try {
      const ws = subprotocols ? new WebSocket(wsUrl, subprotocols) : new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        console.log("[WS] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);
          
          switch (data.type) {
            case "connected":
              if (data.userId && data.onlineUsers) {
                setOnlineUsers(data.onlineUsers);
                optionsRef.current.onConnected?.(data.userId, data.onlineUsers);
              }
              break;
            case "message":
              if (data.payload) {
                // Auto-send delivered if we are the receiver
                if (data.payload.senderId !== user?.id) {
                   wsRef.current?.send(JSON.stringify({ 
                     type: "delivered", 
                     payload: { conversationId: data.payload.conversationId, messageIds: [data.payload.id] } 
                   }));
                }
                optionsRef.current.onMessage?.(data.payload as ChatMessage);
                
                // Trigger query invalidation to update unread badges
                queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              }
              break;
            case "typing":
              if (data.payload) {
                optionsRef.current.onTyping?.(data.payload as TypingEvent);
              }
              break;
            case "presence":
              if (data.payload) {
                const presenceEvent = data.payload as PresenceEvent;
                setOnlineUsers((prev) => {
                  if (presenceEvent.status === "online") {
                    return Array.from(new Set([...prev, presenceEvent.userId]));
                  } else if (presenceEvent.status === "offline") {
                    return prev.filter((id) => id !== presenceEvent.userId);
                  }
                  return prev;
                });
                optionsRef.current.onPresence?.(presenceEvent);
              }
              break;
            case "call_signal":
              if (data.payload) {
                optionsRef.current.onCallSignal?.(data.payload as CallSignalEvent);
              }
              break;
            case "read":
              if (data.payload) {
                optionsRef.current.onRead?.(data.payload.conversationId, data.payload.messageIds);
              }
              break;
            case "delivered":
              if (data.payload) {
                optionsRef.current.onDelivered?.(data.payload.conversationId, data.payload.messageIds);
              }
              break;
            case "error":
              optionsRef.current.onError?.(data.message || "Unknown error");
              break;
            case "notification":
              if (data.payload) {
                optionsRef.current.onNotification?.(data.payload);
                queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              }
              break;
          }
        } catch (error) {
          console.error("[WS] Parse error:", error);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;
        console.log("[WS] Disconnected:", event.code, event.reason);
        optionsRef.current.onDisconnect?.();

        if (isAuthenticated && reconnectAttemptsRef.current < maxReconnectAttempts && event.code !== 4001) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error("[WS] Error:", error);
        optionsRef.current.onError?.("WebSocket connection error");
      };
    } catch (error) {
      console.error("[WS] Connection failed:", error);
    }
  }, [isAuthenticated]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  const sendMessage = useCallback((
    conversationId: number, 
    receiverId: string, 
    content: string, 
    type: string = "text", 
    audioData?: string, 
    audioDuration?: number,
    replyToId?: number,
    attachmentUrl?: string,
    attachmentType?: string
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message",
        payload: { conversationId, receiverId, content, type, audioData, audioDuration, replyToId, attachmentUrl, attachmentType }
      }));
    }
  }, []);

  const sendTyping = useCallback((conversationId: number, isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing",
        payload: { conversationId, isTyping }
      }));
    }
  }, []);

  const sendRead = useCallback((conversationId: number, messageIds: number[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "read",
        payload: { conversationId, messageIds }
      }));
    }
  }, []);

  const sendDelivered = useCallback((conversationId: number, messageIds: number[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "delivered",
        payload: { conversationId, messageIds }
      }));
    }
  }, []);

  const sendPresence = useCallback((status: "online" | "offline" | "away" | "busy") => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "presence",
        payload: { status }
      }));
    }
  }, []);

  const sendCallSignal = useCallback((type: string, targetUserId: number, conversationId?: number, data?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "call_signal",
        payload: { type, targetUserId, conversationId, data }
      }));
    }
  }, []);

  const isUserOnline = useCallback((userId: number) => {
    return onlineUsers.includes(userId);
  }, [onlineUsers]);

  return {
    isConnected,
    onlineUsers,
    sendMessage,
    sendTyping,
    sendRead,
    sendDelivered,
    sendPresence,
    sendCallSignal,
    isUserOnline,
    connect,
    disconnect
  };
}
