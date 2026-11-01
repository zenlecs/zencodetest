import { wsTicketCache } from "./routes";
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import crypto from "crypto";
import { verifySession } from "./auth";
import { log } from "./index";
import { db } from "./db";
import { messages, conversations } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { NotificationEngine } from "./services/notification-engine";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";

interface AuthenticatedClient {
  ws: WebSocket;
  userId: number;
  username: string;
}

interface WSMessage {
  type: "message" | "typing" | "read" | "delivered" | "presence" | "call_signal";
  payload: any;
}

interface ChatMessage {
  conversationId: number;
  receiverId: string;
  content: string;
  type?: "text" | "image" | "file" | "voice" | "audio" | "video";
  iv?: string;
  audioData?: string;
  audioDuration?: number;
  replyToId?: number;
  attachmentUrl?: string;
  attachmentType?: string;
}

interface TypingEvent {
  conversationId: number;
  isTyping: boolean;
}

interface ReadEvent {
  conversationId: number;
  messageIds: number[];
}

interface DeliveredEvent {
  conversationId: number;
  messageIds: number[];
}

interface CallSignal {
  type: "offer" | "answer" | "ice-candidate" | "call-end" | "call-reject";
  targetUserId: number;
  conversationId?: number;
  data: any;
}

const clients = new Map<number, AuthenticatedClient>();

export function pushRealtimeNotification(userId: number, notification: any) {
  const client = clients.get(userId);
  if (client && client.ws.readyState === 1 /* OPEN */) {
    client.ws.send(JSON.stringify({
      type: "notification",
      payload: notification
    }));
  }
}

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws",
    verifyClient: (info, done) => {
      const loopbackSecret = process.env.ZENOS_LOOPBACK_SECRET;
      if (loopbackSecret) {
        const origin = info.origin || "";
        // Strict Origin validation: must not be empty; exact domain/port checks
        const isAllowedOrigin = 
          origin === "zenos-electron" || 
          origin.startsWith("file://") || 
          origin === "http://127.0.0.1" || origin.startsWith("http://127.0.0.1:") ||
          origin === "http://localhost" || origin.startsWith("http://localhost:");

        if (!origin || !isAllowedOrigin) {
          return done(false, 403, "Forbidden origin");
        }

        // Verify loopback bearer token in verifyClient phase with timingSafeEqual
        let subprotocolToken = "";
        const subprotocolHeader = info.req.headers["sec-websocket-protocol"] || "";
        for (const p of subprotocolHeader.split(",")) {
          const trimmed = p.trim();
          if (trimmed.startsWith("zenos-loopback.")) {
            subprotocolToken = trimmed.replace("zenos-loopback.", "");
            break;
          }
        }

        // Strict: only accept Bearer header or zenos-loopback.<SECRET> subprotocol (no URL query token)
        const authHeader = (info.req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const candidateToken = subprotocolToken || authHeader;

        if (
          !candidateToken ||
          candidateToken.length !== loopbackSecret.length ||
          !crypto.timingSafeEqual(Buffer.from(candidateToken), Buffer.from(loopbackSecret))
        ) {
          return done(false, 403, "Invalid loopback token");
        }
      }
      done(true);
    },
    handleProtocols: (protocols) => {
      const list = Array.isArray(protocols) ? protocols : Array.from(protocols);
      // Always select standard zenos.v1 subprotocol to prevent leaking loopback secret in response header
      if (list.includes("zenos.v1")) return "zenos.v1";
      return false;
    }
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    try {
      let subprotocolTicket: string | undefined;
      const subprotocolHeader = req.headers["sec-websocket-protocol"] || "";
      for (const p of subprotocolHeader.split(",")) {
        const trimmed = p.trim();
        if (trimmed.startsWith("zenos-ticket.")) {
          subprotocolTicket = trimmed.replace("zenos-ticket.", "");
          break;
        }
      }

      // Strict: ticket only accepted via zenos-ticket.<TICKET> subprotocol
      const ticket = subprotocolTicket;
      let userId: number | undefined;
      let username: string | undefined;

      // 1. Consume ephemeral single-use ticket if provided
      if (ticket && wsTicketCache.has(ticket)) {
        const ticketData = wsTicketCache.get(ticket)!;
        wsTicketCache.delete(ticket); // Immediately consume
        if (ticketData.expiresAt >= Date.now()) {
          userId = ticketData.userId;
          username = ticketData.username;
        }
      }

      // 2. Fallback to session cookie
      if (!userId && req.headers.cookie) {
        const cookies = parseCookie(req.headers.cookie);
        const sessionToken = cookies["zenos_session"];
        if (sessionToken) {
          const session = await verifySession(sessionToken);
          if (session) {
            userId = session.userId;
            username = session.username || "Unknown";
          }
        }
      }

      if (!userId) {
        ws.close(4001, "Authentication required");
        return;
      }

      const client: AuthenticatedClient = {
        ws,
        userId: userId,
        username: username || "Unknown"
      };

      clients.set(userId, client);
      log(`WebSocket connected: user ${username} (${userId})`, "websocket");

      broadcastPresence(userId, "online");

      ws.on("message", async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await handleMessage(client, message);
        } catch (error) {
          log(`WebSocket message error: ${error}`, "websocket");
          ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
        }
      });

      ws.on("close", () => {
        clients.delete(userId);
        broadcastPresence(userId, "offline");
        log(`WebSocket disconnected: user ${username}`, "websocket");
      });

      ws.on("error", (error) => {
        log(`WebSocket error for user ${username}: ${error}`, "websocket");
        clients.delete(userId);
      });

      ws.send(JSON.stringify({ 
        type: "connected", 
        userId: userId,
        onlineUsers: Array.from(clients.keys())
      }));

    } catch (error) {
      log(`WebSocket connection error: ${error}`, "websocket");
      ws.close(4000, "Connection error");
    }
  });

  log("WebSocket server initialized on /ws", "websocket");
  return wss;
}

async function handleMessage(client: AuthenticatedClient, message: WSMessage) {
  switch (message.type) {
    case "message":
      await handleChatMessage(client, message.payload as ChatMessage);
      break;
    case "typing":
      handleTyping(client, message.payload as TypingEvent);
      break;
    case "read":
      await handleRead(client, message.payload as ReadEvent);
      break;
    case "delivered":
      await handleDelivered(client, message.payload as DeliveredEvent);
      break;
    case "presence":
      broadcastPresence(client.userId, message.payload.status);
      break;
    case "call_signal":
      handleCallSignal(client, message.payload as CallSignal);
      break;
    default:
      log(`Unknown message type: ${message.type}`, "websocket");
  }
}

async function handleChatMessage(client: AuthenticatedClient, payload: ChatMessage) {
  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, payload.conversationId)
    });

    if (!conversation) {
      client.ws.send(JSON.stringify({ type: "error", message: "Conversation not found" }));
      return;
    }

    const participantIds = conversation.participants || [];
    const userIdStr = client.userId.toString();
    if (!participantIds.includes(userIdStr)) {
      client.ws.send(JSON.stringify({ type: "error", message: "Not a participant" }));
      return;
    }

    // content is already encrypted payload from client
    const [newMessage] = await db.insert(messages).values({
      conversationId: payload.conversationId,
      senderId: userIdStr,
      receiverId: payload.receiverId,
      type: payload.type || "text",
      contentEncrypted: payload.content,
      iv: payload.iv || null,
      audioData: payload.audioData || null,
      audioDuration: payload.audioDuration || null,
      replyToId: payload.replyToId || null,
      attachmentUrl: payload.attachmentUrl || null,
      attachmentType: payload.attachmentType || null,
      status: "sent",
      isRead: false
    }).returning();

    await db.update(conversations)
      .set({ 
        lastMessage: payload.type === "audio" ? "🎤 Sesli mesaj" : "🔒 Şifreli Mesaj",
        lastMessageTime: new Date(),
        updatedAt: new Date()
      })
      .where(eq(conversations.id, payload.conversationId));

    const messageResponse = {
      type: "message",
      payload: {
        id: newMessage.id,
        conversationId: payload.conversationId,
        senderId: client.userId,
        senderUsername: client.username,
        content: payload.content,
        type: payload.type || "text",
        audioData: payload.audioData,
        audioDuration: payload.audioDuration,
        replyToId: payload.replyToId,
        attachmentUrl: payload.attachmentUrl,
        attachmentType: payload.attachmentType,
        status: "sent",
        timestamp: newMessage.createdAt,
        isRead: false
      }
    };

    for (const participantIdStr of participantIds) {
      const participantId = parseInt(participantIdStr, 10);
      const targetClient = clients.get(participantId);
      if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
        targetClient.ws.send(JSON.stringify(messageResponse));
      } else if (participantId !== client.userId) {
        try {
          await NotificationEngine.dispatch(participantId, {
            type: "chat_message",
            message: `${client.username} size bir mesaj gönderdi.`,
            metadata: { link: `/os/communications` }
          });
        } catch (e) {
          log(`Failed to create notification for offline user: ${e}`, "websocket");
        }
      }
    }

  } catch (error) {
    log(`Error handling chat message: ${error}`, "websocket");
    client.ws.send(JSON.stringify({ type: "error", message: "Failed to send message" }));
  }
}

async function handleTyping(client: AuthenticatedClient, payload: TypingEvent) {
  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, payload.conversationId)
    });

    if (!conversation) return;

    const participantIds = conversation.participants || [];
    const userIdStr = client.userId.toString();
    
    if (!participantIds.includes(userIdStr)) return;

    participantIds.forEach((participantIdStr) => {
      const participantId = parseInt(participantIdStr, 10);
      if (participantId !== client.userId) {
        const targetClient = clients.get(participantId);
        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
          targetClient.ws.send(JSON.stringify({
            type: "typing",
            payload: {
              userId: client.userId,
              username: client.username,
              conversationId: payload.conversationId,
              isTyping: payload.isTyping
            }
          }));
        }
      }
    });
  } catch (error) {
    log(`Error handling typing: ${error}`, "websocket");
  }
}

async function handleRead(client: AuthenticatedClient, payload: ReadEvent) {
  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, payload.conversationId)
    });

    if (!conversation) return;

    const participantIds = conversation.participants || [];
    const userIdStr = client.userId.toString();
    
    if (!participantIds.includes(userIdStr)) return;

    if (payload.messageIds.length > 0) {
      await db.update(messages)
        .set({ isRead: true, readAt: new Date(), status: "read" })
        .where(
          and(
            eq(messages.conversationId, payload.conversationId),
            inArray(messages.id, payload.messageIds)
          )
        );
    }

    participantIds.forEach((participantIdStr) => {
      const participantId = parseInt(participantIdStr, 10);
      if (participantId !== client.userId) {
        const targetClient = clients.get(participantId);
        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
          targetClient.ws.send(JSON.stringify({
            type: "read",
            payload: {
              userId: client.userId,
              conversationId: payload.conversationId,
              messageIds: payload.messageIds
            }
          }));
        }
      }
    });
  } catch (error) {
    log(`Error handling read receipt: ${error}`, "websocket");
  }
}

async function handleDelivered(client: AuthenticatedClient, payload: DeliveredEvent) {
  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, payload.conversationId)
    });

    if (!conversation) return;

    const participantIds = conversation.participants || [];
    const userIdStr = client.userId.toString();
    
    if (!participantIds.includes(userIdStr)) return;

    if (payload.messageIds.length > 0) {
      await db.update(messages)
        .set({ status: "delivered" })
        .where(
          and(
            eq(messages.conversationId, payload.conversationId),
            inArray(messages.id, payload.messageIds),
            eq(messages.status, "sent") // Only update if currently sent
          )
        );
    }

    participantIds.forEach((participantIdStr) => {
      const participantId = parseInt(participantIdStr, 10);
      if (participantId !== client.userId) {
        const targetClient = clients.get(participantId);
        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
          targetClient.ws.send(JSON.stringify({
            type: "delivered",
            payload: {
              userId: client.userId,
              conversationId: payload.conversationId,
              messageIds: payload.messageIds
            }
          }));
        }
      }
    });
  } catch (error) {
    log(`Error handling delivered receipt: ${error}`, "websocket");
  }
}

async function handleCallSignal(client: AuthenticatedClient, payload: CallSignal) {
  const userIdStr = client.userId.toString();
  const targetIdStr = payload.targetUserId.toString();
  
  if (payload.conversationId) {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, payload.conversationId)
    });
    
    if (!conversation) {
      client.ws.send(JSON.stringify({
        type: "call_signal",
        payload: {
          type: "unauthorized",
          message: "Geçersiz konuşma"
        }
      }));
      return;
    }
    
    const participants = conversation.participants || [];
    if (!participants.includes(userIdStr) || !participants.includes(targetIdStr)) {
      client.ws.send(JSON.stringify({
        type: "call_signal",
        payload: {
          type: "unauthorized",
          message: "Bu kullanıcıyla görüşme yapma yetkiniz yok"
        }
      }));
      return;
    }
  } else {
    const userConversations = await db.query.conversations.findMany({
      where: sql`${conversations.participants}::text[] @> ARRAY[${userIdStr}::text]`
    });
    const sharedConversation = userConversations.find((conv) => {
      const parts = conv.participants || [];
      return parts.includes(targetIdStr);
    });
    
    if (!sharedConversation) {
      client.ws.send(JSON.stringify({
        type: "call_signal",
        payload: {
          type: "unauthorized",
          message: "Bu kullanıcıyla görüşme yapma yetkiniz yok"
        }
      }));
      return;
    }
  }

  const targetClient = clients.get(payload.targetUserId);
  
  if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
    targetClient.ws.send(JSON.stringify({
      type: "call_signal",
      payload: {
        type: payload.type,
        fromUserId: client.userId,
        fromUsername: client.username,
        conversationId: payload.conversationId,
        data: payload.data
      }
    }));
  } else {
    client.ws.send(JSON.stringify({
      type: "call_signal",
      payload: {
        type: "user_offline",
        targetUserId: payload.targetUserId
      }
    }));
  }
}

function broadcastPresence(userId: number, status: "online" | "offline" | "away" | "busy") {
  clients.forEach((targetClient) => {
    if (targetClient.ws.readyState === WebSocket.OPEN) {
      targetClient.ws.send(JSON.stringify({
        type: "presence",
        payload: { userId, status }
      }));
    }
  });
}

export function getOnlineUsers(): number[] {
  return Array.from(clients.keys());
}

export function isUserOnline(userId: number): boolean {
  return clients.has(userId);
}

export function sendToUser(userId: number, message: WSMessage): boolean {
  const client = clients.get(userId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}
