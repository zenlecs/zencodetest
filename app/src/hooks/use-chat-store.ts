import { create } from "zustand";
import { openDB } from "idb";

// --- Types ---
export interface ZenMessage {
  id: number | string; // string for temporary offline messages
  conversationId: number;
  senderId: string;
  senderUsername?: string;
  content: string; // Encrypted content
  type: "text" | "image" | "file" | "voice" | "audio" | "video";
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  timestamp: string | Date;
  replyToId?: number;
  attachmentUrl?: string;
  attachmentType?: string;
  audioData?: string;
  audioDuration?: number;
}

export interface ZenConversation {
  id: number;
  participants: string[];
  lastMessage?: string;
  lastMessageTime?: string | Date;
  unreadCount: number;
  isEncrypted: boolean;
}

export interface ZenContact {
  id: number;
  targetUserId: number;
  name: string; // Decrypted alias
  publicKey: string;
  status: "online" | "offline" | "away" | "busy";
  lastSeen?: string | Date;
  isTyping?: boolean;
}

interface ChatState {
  // Data
  messages: Record<number, ZenMessage[]>; // keyed by conversationId
  conversations: ZenConversation[];
  contacts: ZenContact[];
  
  // UI State
  activeConversationId: number | null;
  activeContactId: number | null;
  
  // Actions
  setActiveChat: (conversationId: number, contactId: number) => void;
  setConversations: (conversations: ZenConversation[]) => void;
  setContacts: (contacts: ZenContact[]) => void;
  addMessage: (message: ZenMessage) => void;
  updateMessageStatus: (conversationId: number, messageIds: number[], status: ZenMessage["status"]) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  setOnlineStatus: (userId: number, status: ZenContact["status"]) => void;
  
  // Offline Sync
  syncOfflineMessages: () => Promise<void>;
}

// --- IndexedDB Wrapper ---
const DB_NAME = "zenconnect_db";
const DB_VERSION = 1;

async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "id" });
        store.createIndex("by_conversation", "conversationId");
      }
      if (!db.objectStoreNames.contains("offline_queue")) {
        db.createObjectStore("offline_queue", { keyPath: "tempId", autoIncrement: true });
      }
    },
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  conversations: [],
  contacts: [],
  activeConversationId: null,
  activeContactId: null,

  setActiveChat: (conversationId, contactId) => 
    set({ activeConversationId: conversationId, activeContactId: contactId }),

  setConversations: (conversations) => set({ conversations }),
  
  setContacts: (contacts) => set({ contacts }),

  addMessage: (message) => set((state) => {
    const convoMessages = state.messages[message.conversationId] || [];
    // Ensure no duplicates by ID
    if (convoMessages.some(m => m.id === message.id)) return state;
    
    return {
      messages: {
        ...state.messages,
        [message.conversationId]: [...convoMessages, message].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      }
    };
  }),

  updateMessageStatus: (conversationId, messageIds, status) => set((state) => {
    const convoMessages = state.messages[conversationId];
    if (!convoMessages) return state;

    return {
      messages: {
        ...state.messages,
        [conversationId]: convoMessages.map(msg => 
          messageIds.includes(Number(msg.id)) ? { ...msg, status } : msg
        )
      }
    };
  }),

  setTyping: (conversationId, userId, isTyping) => set((state) => {
    return {
      contacts: state.contacts.map(c => 
        c.targetUserId === userId ? { ...c, isTyping } : c
      )
    };
  }),

  setOnlineStatus: (userId, status) => set((state) => {
    return {
      contacts: state.contacts.map(c => 
        c.targetUserId === userId ? { ...c, status } : c
      )
    };
  }),

  syncOfflineMessages: async () => {
    // Basic offline sync placeholder
    try {
      const db = await initDB();
      const queue = await db.getAll("offline_queue");
      if (queue.length > 0) {
        console.log("Syncing offline messages...", queue);
        // Implement sync logic
        await db.clear("offline_queue");
      }
    } catch (e) {
      console.error("Failed to sync offline messages", e);
    }
  }
}));
