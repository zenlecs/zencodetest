import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Phone,
  Video,
  Search,
  Plus,
  Send,
  Mic,
  PhoneOff,
  MicOff,
  VideoOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  User,
  Upload,
  Presentation,
  X,
  Play,
  ChevronLeft,
  ChevronRight,
  File,
  Image,
  Copy,
  Check,
  ArrowRight,
  Link2,
  GripHorizontal,
  MoreVertical,
  Archive,
  Trash2,
  Ban,
  ArrowUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlobalCallOverlay } from "@/components/layout/global-call-overlay";
import { openDetachedWindow, WindowPortal } from "@/components/ui/window-portal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  useContacts, 
  useConversations, 
  useMessages, 
  useSearchUsers, 
  useStartDirectChat,
  useArchiveConversation,
  useDeleteConversation,
  useBlockContact
} from "@/hooks/use-api";
import { motion, AnimatePresence } from "motion/react";
import { useWebSocket } from "@/lib/contexts/websocket-context";
import type { ChatMessage } from "@/hooks/use-websocket";
import { useGlobalCall } from "@/lib/contexts/call-context";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { CallEncryption, generateSessionId } from "@/lib/crypto";
import { encryptP2PMessage, decryptP2PMessage } from "@/lib/zk-vault";
import { useAudioAnalyzer } from "@/hooks/use-audio-analyzer";
import { useToast } from "@/hooks/use-toast";
import { AudioSpectrum, BackgroundSpectrum } from "@/components/audio-spectrum";
import { LiquidStroke } from "@/components/ui/liquid-stroke";

interface WorkspaceFile {
  id: string;
  name: string;
  type: "file" | "image" | "presentation";
  url?: string;
}

interface WorkspaceSession {
  conversationId: number;
  files: WorkspaceFile[];
  activePresentation: { fileId: string; currentSlide: number } | null;
  isPresenting: boolean;
}

export default function CommunicationsPage() {
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number>(0);
  const [messageInput, setMessageInput] = useState("");
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [incomingCall, setIncomingCall] = useState<{ fromUserId: number; fromUsername: string; conversationId?: number; offer?: RTCSessionDescriptionInit; callType?: "audio" | "video" } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [workspaceSessions, setWorkspaceSessions] = useState<Map<number, WorkspaceSession>>(new Map());
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const ownWindow = window.location.hash.includes("/standalone/communications");
  const [detachedWindow, setDetachedWindow] = useState<Window | null>(null);
  const [externalOpen, setExternalOpen] = useState(false);
  const isDetached = ownWindow || detachedWindow !== null;

  useEffect(() => {
    if (!window.electron || ownWindow) return;
    const closed = () => setExternalOpen(false);
    window.electron.receive("communication-window-closed", closed);
    return () => {
      window.electron?.removeListener("communication-window-closed", closed);
    };
  }, [ownWindow]);
  const [showTitle, setShowTitle] = useState(false);
  const isStandaloneWindow = false; // Not used with React Portals
  
  useEffect(() => {
    const timer = setTimeout(() => setShowTitle(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const searchResults = useSearchUsers(submittedQuery);
  const startDirectChat = useStartDirectChat();
  const archiveConversation = useArchiveConversation();
  const deleteConversation = useDeleteConversation();
  const blockContact = useBlockContact();

  const [workspaceHeight, setWorkspaceHeight] = useState(160);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(160);
  
  // Voice messaging state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingCancelledRef = useRef<boolean>(false);

  const { user } = useAuth();
  const audioAnalyzer = useAudioAnalyzer();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callEncryptionRef = useRef<CallEncryption>(new CallEncryption());
  const pendingRemoteKeyRef = useRef<JsonWebKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { data: conversations } = useConversations();
  const { data: dbMessages } = useMessages(String(selectedConversationId));


  const currentUserId = user?.id ? String(user.id) : "";

  const currentWorkspace = workspaceSessions.get(selectedConversationId) || {
    conversationId: selectedConversationId,
    files: [],
    activePresentation: null,
    isPresenting: false,
  };

  const handleNewMessage = useCallback((message: ChatMessage) => {
    if (message.conversationId === selectedConversationId) {
      // Add to local messages for immediate display
      setLocalMessages((prev) => {
        // Avoid duplicates
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
    }
    // Update conversations list for last message preview (but NOT messages query)
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
  }, [selectedConversationId, queryClient]);

  const { isConnected, sendMessage: wsSendMessage, sendTyping } = useWebSocket();
  const { startAudioCall, startVideoCall } = useGlobalCall();


  useEffect(() => { if (contacts?.length && !selectedContactId) setSelectedContactId(contacts[0].id); }, [contacts, selectedContactId]);
  useEffect(() => { 
    if (conversations && conversations.length > 0 && selectedContactId && contacts) { 
      const contact = contacts.find(c => c.id === selectedContactId);
      if (contact) {
        const targetId = contact.targetUserId ? String(contact.targetUserId) : null;
        const c = conversations.find((conv) => {
          let parts = conv.participants || [];
          if (typeof parts === 'string') {
            try { 
              const pStr = (parts as any).replace('{', '[').replace('}', ']');
              parts = JSON.parse(pStr); 
            } catch(e) { parts = []; }
          }
          if (!Array.isArray(parts)) parts = [];
          
          const strParts = parts.map(p => String(p));
          if (targetId && strParts.includes(targetId)) return true;
          return strParts.includes(currentUserId) && strParts.length === 2;
        }); 
        if (c) setSelectedConversationId(c.id); 
      }
    } 
  }, [conversations, selectedContactId, contacts, currentUserId]);
  useEffect(() => { 
    setLocalMessages([]); 
    // Initialize workspace session when conversation is selected
    if (selectedConversationId && selectedConversationId > 0) {
      setWorkspaceSessions(prev => {
        const next = new Map(prev);
        if (!next.has(selectedConversationId)) {
          next.set(selectedConversationId, { conversationId: selectedConversationId, files: [], activePresentation: null, isPresenting: false });
        }
        return next;
      });
    }
  }, [selectedConversationId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [localMessages, dbMessages]);

  const startCallTimer = () => { setCallDuration(0); callTimerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000); };
  const stopCallTimer = () => { if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; } setCallDuration(0); };
  const formatDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const selectedContact = contacts?.find((c) => c.id === selectedContactId);
  const { toast } = useToast();

  const handleSendMessage = async () => { 
    if (!messageInput.trim() || !selectedContact || !selectedConversationId) return; 
    
    const targetPublicKey = selectedContact.publicKey;
    if (!targetPublicKey) {
      toast({ title: "Hata", description: "Alıcının açık anahtarı bulunamadı, şifreleme yapılamıyor.", variant: "destructive" });
      return;
    }

    const targetId = selectedContact.targetUserId || selectedContact.id;
    const content = messageInput;
    setMessageInput(""); 
    
    if (isConnected) {
      try {
        const encryptedContent = await encryptP2PMessage(content, targetPublicKey);
        wsSendMessage(selectedConversationId, String(targetId), encryptedContent, "text"); 
        sendTyping(selectedConversationId, false);
      } catch (e: any) {
        toast({ title: "Şifreleme Hatası", description: e.message || "Mesaj şifrelenemedi.", variant: "destructive" });
      }
    }
  };

  const handleSendAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContact || !selectedConversationId) return;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();

      let fileType = "file";
      if (file.type.startsWith("image/")) fileType = "image";
      else if (file.type.startsWith("video/")) fileType = "video";
      else if (file.type.startsWith("audio/")) fileType = "audio";

      const targetPublicKey = selectedContact.publicKey;
      if (!targetPublicKey) {
        toast({ title: "Hata", description: "Alıcının açık anahtarı bulunamadı.", variant: "destructive" });
        return;
      }

      const encryptedMessage = await encryptP2PMessage(`[Dosya: ${file.name}]`, targetPublicKey);

      const targetId = selectedContact.targetUserId || selectedContact.id;
      wsSendMessage(selectedConversationId, String(targetId), encryptedMessage, fileType, undefined, undefined, undefined, url, fileType);
      
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error(error);
    }
  };


  const initWorkspaceSession = (convId: number) => {
    setWorkspaceSessions(prev => {
      const next = new Map(prev);
      if (!next.has(convId)) next.set(convId, { conversationId: convId, files: [], activePresentation: null, isPresenting: false });
      return next;
    });
  };

  const clearWorkspaceSession = (convId: number) => {
    setWorkspaceSessions(prev => { const next = new Map(prev); next.delete(convId); return next; });
  };

  // Voice recording functions
  const startVoiceRecording = async () => {
    if (!selectedContact || !selectedConversationId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingCancelledRef.current = false;
      
      // Connect to audio analyzer for spectrum visualization
      audioAnalyzer.connectMediaStream(stream);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        audioAnalyzer.disconnect();
        recordingStreamRef.current = null;
        
        // Only send if not cancelled
        if (!recordingCancelledRef.current && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await sendVoiceMessage(audioBlob);
        }
        audioChunksRef.current = [];
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
    } catch (err) {
      console.error('[Voice] Failed to start recording:', err);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Set cancelled flag FIRST to prevent onstop from sending
      recordingCancelledRef.current = true;
      audioChunksRef.current = [];
      
      // Stop the recorder (this triggers onstop, but flag prevents sending)
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      
      audioAnalyzer.disconnect();
      recordingStreamRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!selectedContact || !selectedConversationId) return;
    const targetId = selectedContact.targetUserId || selectedContact.id;
    
    // Convert blob to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      const duration = recordingDuration;
      setRecordingDuration(0);
      
      if (isConnected) {
        wsSendMessage(selectedConversationId, String(targetId), `🎤 Sesli mesaj (${duration}s)`, "audio", base64Audio, duration);
      } else {
        try {
          await fetch("/api/messages/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              conversationId: selectedConversationId,
              receiverId: String(targetId),
              content: `🎤 Sesli mesaj (${duration}s)`,
              type: "audio",
              audioData: base64Audio,
              audioDuration: duration
            })
          });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations", String(selectedConversationId), "messages"] });
        } catch (error) {
          console.error("[Voice] REST fallback failed:", error);
        }
      }
    };
    reader.readAsDataURL(audioBlob);
  };

  const playAudioMessage = async (audioData: string, messageId: number) => {
    if (playingAudioId === messageId) {
      audioElementRef.current?.pause();
      audioAnalyzer.disconnect();
      setPlayingAudioId(null);
      return;
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioAnalyzer.disconnect();
    }
    
    const audio = new Audio(`data:audio/webm;base64,${audioData}`);
    audio.crossOrigin = "anonymous";
    audioElementRef.current = audio;
    setPlayingAudioId(messageId);
    
    audio.onended = () => {
      audioAnalyzer.disconnect();
      setPlayingAudioId(null);
    };
    audio.onerror = () => {
      audioAnalyzer.disconnect();
      setPlayingAudioId(null);
    };
    
    try {
      await audio.play();
      // Connect to analyzer after playback starts (for spectrum visualization)
      // Note: We use a separate audio context for playback visualization
      // to avoid the MediaElementSource single-connection limitation
    } catch {
      setPlayingAudioId(null);
    }
  };

  // Long press detection for voice button
  const handleButtonPress = () => {
    if (!selectedContact || !selectedConversationId) return;
    longPressTimerRef.current = setTimeout(() => {
      startVoiceRecording();
    }, 2000);
  };

  const handleButtonRelease = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isRecording) {
      stopVoiceRecording();
    } else if (messageInput.trim()) {
      handleSendMessage();
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = workspaceHeight;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.clientY - resizeStartY.current;
      const newHeight = Math.max(120, Math.min(400, resizeStartHeight.current + delta));
      setWorkspaceHeight(newHeight);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedConversationId || selectedConversationId === 0) return;
    Array.from(files).forEach(file => {
      const id = crypto.randomUUID();
      const isImage = file.type.startsWith("image/");
      const isPres = (file.name || '').endsWith(".pptx") || (file.name || '').endsWith(".pdf");
      const type: WorkspaceFile["type"] = isImage ? "image" : isPres ? "presentation" : "file";
      const reader = new FileReader();
      reader.onload = () => {
        const newFile: WorkspaceFile = { id, name: file.name, type, url: reader.result as string };
        setWorkspaceSessions(prev => {
          const next = new Map(prev);
          const session = next.get(selectedConversationId) || { conversationId: selectedConversationId, files: [], activePresentation: null, isPresenting: false };
          session.files = [...session.files, newFile];
          next.set(selectedConversationId, session);
          return next;
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeFile = (fileId: string) => {
    setWorkspaceSessions(prev => {
      const next = new Map(prev);
      const session = next.get(selectedConversationId);
      if (session) {
        session.files = session.files.filter(f => f.id !== fileId);
        if (session.activePresentation?.fileId === fileId) session.activePresentation = null;
        next.set(selectedConversationId, session);
      }
      return next;
    });
  };

  const startPresentation = (fileId: string) => {
    setWorkspaceSessions(prev => {
      const next = new Map(prev);
      const session = next.get(selectedConversationId);
      if (session) { session.activePresentation = { fileId, currentSlide: 0 }; session.isPresenting = true; next.set(selectedConversationId, session); }
      return next;
    });
  };

  const stopPresentation = () => {
    setWorkspaceSessions(prev => {
      const next = new Map(prev);
      const session = next.get(selectedConversationId);
      if (session) { session.activePresentation = null; session.isPresenting = false; next.set(selectedConversationId, session); }
      return next;
    });
  };



  // Deduplicate messages: prefer localMessages for real-time, fallback to dbMessages
  const allMessages = (() => {
    const dbMsgs = dbMessages || [];
    const localMsgs = localMessages;
    const seenIds = new Set<number>();
    const result: typeof localMessages = [];
    
    // Add local messages first (they're most recent)
    for (const msg of localMsgs) {
      if (msg.id && !seenIds.has(msg.id)) {
        seenIds.add(msg.id);
        result.push(msg);
      } else if (!msg.id) {
        result.push(msg); // Keep messages without ID (optimistic)
      }
    }
    
    // Add database messages that aren't already in local
    for (const msg of dbMsgs) {
      if (!seenIds.has(msg.id)) {
        seenIds.add(msg.id);
        // Map db message to chat message format
        result.push({
          id: msg.id,
          conversationId: msg.conversationId,
          senderId: typeof msg.senderId === 'string' ? parseInt(msg.senderId) : msg.senderId,
          content: (msg as any).content || msg.contentEncrypted,
          contentEncrypted: msg.contentEncrypted,
          timestamp: new Date(msg.createdAt).toISOString(),
          createdAt: new Date(msg.createdAt).toISOString(),
          type: msg.type as "text" | "image" | "file" | "voice"
        });
      }
    }
    
    // Sort by timestamp/createdAt
    return result.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      return timeA - timeB;
    });
  })();
  const filteredContacts = contacts?.filter(c => {
    // Check if the contact is blocked
    if (c.isBlocked) return false;

    // Check if the associated conversation is deleted or archived
    if (conversations && currentUserId) {
      const targetId = c.targetUserId;
      const conversation = conversations.find((conv) => {
        if (targetId && conv.participants.includes(String(targetId))) return true;
        return conv.participants.includes(currentUserId) && conv.participants.length === 2;
      });

      if (conversation) {
        if (conversation.deletedBy?.includes(currentUserId)) return false;
        if (conversation.archivedBy?.includes(currentUserId)) return false;
      }
    }

    return (c.name || (c as any).targetUsername || "").toLowerCase().includes(searchQuery.toLowerCase());
  }) || [];

  const content = (
    <div className={`relative w-full ${isDetached ? 'h-full' : 'max-w-[1265px] mx-auto h-[81vh] mt-[5vh]'}`}>
      <LiquidStroke radius={isDetached ? 24 : 16} />
      
      <div
        className={`relative z-10 flex h-full w-full flex-col overflow-hidden bg-background transition-colors duration-500 ease-out ${isDetached ? "rounded-[24px]" : "rounded-[14px] shadow-[0_40px_80px_-20px_rgba(190,175,155,0.35),_0_20px_40px_-10px_rgba(190,175,155,0.2)] dark:shadow-[0_20px_80px_rgba(0,0,0,0.8)]"}`}
        style={isDetached ? { clipPath: "inset(0 round 24px)" } : undefined}
      >
        
        {isDetached ? (
          <div 
            className="flex h-10 w-full flex-shrink-0 items-center justify-between overflow-hidden rounded-t-[24px] border-b border-border/10 bg-background px-4 transition-colors duration-500 ease-out" 
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <div className="flex items-center">
              <img src="./connect-blue.svg" alt="ZenOS" className="h-[12px] w-auto shrink-0 dark:hidden" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} />
              <img src="./connect-white.svg" alt="ZenOS" className="h-[12px] w-auto shrink-0 hidden dark:block" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} />
            </div>
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button 
                onClick={() => {
                  if (ownWindow) {
                    window.electron?.send("window-close");
                    return;
                  }
                  detachedWindow?.close();
                  setDetachedWindow(null);
                }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                title="Ana Pencereye Geri Dön"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => {
              if (window.electron) {
                window.electron.send("detach-communication");
                setExternalOpen(true);
                return;
              }
              const next = openDetachedWindow("ZenOS İletişim");
              if (next) setDetachedWindow(next);
            }}
            className="absolute top-3 right-3 z-50 p-2 rounded-lg bg-background/80 hover:bg-background backdrop-blur-md border border-border/50 shadow-sm text-foreground/70 hover:text-foreground transition-all flex items-center justify-center"
            title="Yeni Pencerede Aç"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

      <div className="flex-1 flex overflow-hidden relative w-full">

      {/* iPhone/Siri-style Audio Spectrum - Left Side */}
      <AudioSpectrum 
        frequencyData={audioAnalyzer.frequencyData} 
        isActive={isRecording || playingAudioId !== null}
        side="left"
        mode={isRecording ? "recording" : "playback"}
      />
      
      {/* iPhone/Siri-style Audio Spectrum - Right Side */}
      <AudioSpectrum 
        frequencyData={audioAnalyzer.frequencyData} 
        isActive={isRecording || playingAudioId !== null}
        side="right"
        mode={isRecording ? "recording" : "playback"}
      />
      

      

      <div className="w-[320px] flex-shrink-0 flex flex-col bg-[#F4F1EB] dark:bg-[#2A2A2C] border-r border-black/5 dark:border-white/5 relative z-10 min-h-[600px]">
        <div className="p-4 flex items-center justify-between border-b border-black/5 dark:border-white/5">
          <div className={`relative h-6 flex-1 overflow-hidden transition-all duration-700 ease-out ${showTitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <AnimatePresence initial={false}>
              <motion.span 
                key={isSearchMode ? "search" : "chat"}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-y-0 left-0 flex items-center text-[17px] font-semibold text-foreground/90 whitespace-nowrap"
              >
                {isSearchMode ? "Kullanıcı Bul" : "Sohbetler"}
              </motion.span>
            </AnimatePresence>
          </div>
          <button onClick={() => { setIsSearchMode(!isSearchMode); setSearchQuery(""); setSubmittedQuery(""); }} className="w-7 h-7 rounded-lg hover:bg-foreground/5 flex items-center justify-center transition-colors relative overflow-hidden" data-testid="button-new-chat">
            <AnimatePresence initial={false}>
              <motion.div
                key={isSearchMode ? "close" : "add"}
                initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 flex items-center justify-center"
              >
                {isSearchMode ? <X className="w-4 h-4 text-foreground/50" /> : <Plus className="w-4 h-4 text-foreground/50" />}
              </motion.div>
            </AnimatePresence>
          </button>
        </div>
        <div className="p-3">
          <div className="relative flex items-center">
            <Input 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              onKeyDown={(e) => {
                if (isSearchMode && e.key === "Enter") {
                  setSubmittedQuery(searchQuery);
                  searchResults.refetch();
                }
              }}
              className="h-9 pl-3 text-xs bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-foreground rounded-lg transition-all w-full" 
              data-testid="input-search" 
            />
            {!searchQuery && (
              <div className="absolute inset-y-0 left-3 pointer-events-none flex items-center overflow-hidden w-full">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={isSearchMode ? "placeholder-search" : "placeholder-chat"}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                    className="absolute text-xs text-muted-foreground/50 whitespace-nowrap"
                  >
                    {isSearchMode ? "Kullanıcı Adı" : "Sohbetlerde ara..."}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {isSearchMode ? (
              searchResults.isLoading ? (
                <div className="p-8 text-center text-muted-foreground/50 text-xs">Aranıyor...</div>
              ) : searchResults.data?.length ? (
                searchResults.data.map((user: any) => (
                  <button key={user.id} onClick={() => {
                    startDirectChat.mutate({ targetUserId: user.id }, {
                      onSuccess: () => {
                        setIsSearchMode(false);
                        setSearchQuery("");
                        setSubmittedQuery("");
                      }
                    });
                  }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-foreground/[0.03] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-white/90 font-medium">{(user.displayName || user.username || 'K').slice(0, 2).toUpperCase()}</span>
                    </div>
                    <span className="text-xs text-foreground/70 truncate">{user.displayName || user.username}</span>
                  </button>
                ))
              ) : submittedQuery ? (
                <div className="p-8 text-center text-muted-foreground/50 text-xs">Kullanıcı bulunamadı</div>
              ) : (
                <div className="p-8 text-center text-muted-foreground/50 text-xs">Kullanıcı adı yazıp Enter'a basın</div>
              )
            ) : contactsLoading ? (
              <div className="p-8 text-center text-muted-foreground/50 text-xs">...</div>
            ) : filteredContacts.length > 0 ? (
              filteredContacts.map((contact) => (
                <button key={contact.id} onClick={() => setSelectedContactId(contact.id)} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${selectedContactId === contact.id ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]"}`} data-testid={`contact-${contact.id}`}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-white/90 font-medium">{((contact as any).name || (contact as any).targetUsername || 'K').slice(0, 2).toUpperCase()}</span>
                  </div>
                  <span className="text-xs text-foreground/70 truncate">{((contact as any).name || (contact as any).targetUsername || 'Kişi')}</span>
                </button>
              ))
            ) : null}
          </div>
        </ScrollArea>
      </div>

      {/* Right Section */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#FCFCFC] dark:bg-[#000000] min-h-[600px] relative">
        {/* Chat Panel with reactive spectrum effect */}
        <div 
          className={`flex-1 flex flex-col transition-all duration-500 overflow-hidden relative ${
            isRecording 
              ? "shadow-[inset_0_0_30px_rgba(239,68,68,0.08)]" 
              : playingAudioId !== null 
                ? "shadow-[inset_0_0_30px_rgba(59,130,246,0.08)]"
                : ""
          }`}
          style={isRecording ? {
            animation: "pulse-glow-red 2s ease-in-out infinite"
          } : playingAudioId !== null ? {
            animation: "pulse-glow-blue 2s ease-in-out infinite"
          } : undefined}
        >
          {selectedContact && (
            <div className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-black/5 dark:border-white/5 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center">
                  <span className="text-[10px] text-white/90 font-medium">{((selectedContact as any).name || (selectedContact as any).targetUsername || "K").slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium text-foreground/90">{((selectedContact as any)?.name || (selectedContact as any)?.targetUsername)}</span>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400" : "bg-amber-400"}`} />
                    <span className="text-[9px] text-muted-foreground/60">{isConnected ? "Bağlı" : "Bağlanıyor..."}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { if(selectedContact && selectedConversationId) startAudioCall(selectedContact.targetUserId || selectedContact.id, selectedConversationId, selectedContact); }} disabled={!isConnected} className="w-8 h-8 rounded-xl bg-foreground/[0.03] flex items-center justify-center hover:bg-foreground/[0.06] transition-colors disabled:opacity-20" data-testid="button-audio-call"><Phone className="w-3.5 h-3.5 text-muted-foreground" /></button>
                <button onClick={() => { if(selectedContact && selectedConversationId) startVideoCall(selectedContact.targetUserId || selectedContact.id, selectedConversationId, selectedContact); }} disabled={!isConnected} className="w-8 h-8 rounded-xl bg-foreground/[0.03] flex items-center justify-center hover:bg-foreground/[0.06] transition-colors disabled:opacity-20" data-testid="button-video-call"><Video className="w-3.5 h-3.5 text-muted-foreground" /></button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-8 h-8 rounded-xl bg-foreground/[0.03] flex items-center justify-center hover:bg-foreground/[0.06] transition-colors ml-1" data-testid="button-chat-options">
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem 
                      onClick={() => {
                        if(selectedConversationId) {
                          archiveConversation.mutate(selectedConversationId, {
                            onSuccess: () => {
                              setSelectedContactId(null);
                              setSelectedConversationId(0);
                            }
                          });
                        }
                      }}
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Archive className="w-4 h-4" />
                      <span>Arşivle</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => {
                        if(selectedConversationId) {
                          deleteConversation.mutate(selectedConversationId, {
                            onSuccess: () => {
                              setSelectedContactId(null);
                              setSelectedConversationId(0);
                            }
                          });
                        }
                      }}
                      className="cursor-pointer text-red-600 focus:text-red-600 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Sohbeti Sil</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => {
                        if(selectedContact) {
                          blockContact.mutate(selectedContact.id, {
                            onSuccess: () => {
                              setSelectedContactId(null);
                              setSelectedConversationId(0);
                            }
                          });
                        }
                      }}
                      className="cursor-pointer text-orange-600 focus:text-orange-600 flex items-center gap-2"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Kişiyi Engelle</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          <div className="flex-1 relative overflow-hidden" style={{ minHeight: '400px' }}>
            {/* Oval/Abstract Background Spectrum */}
            <BackgroundSpectrum 
              frequencyData={audioAnalyzer.frequencyData}
              isActive={isRecording || playingAudioId !== null}
              mode={isRecording ? "recording" : "playback"}
            />
            
            <div className="absolute inset-0 overflow-y-auto p-3" data-testid="messages-container">
              {allMessages.length > 0 ? (
                <div className="space-y-2 relative z-10">
                  {allMessages.map((msg, idx) => {
                    const isOwn = String(msg.senderId) === currentUserId;
                    const content = msg.content || msg.contentEncrypted || "";
                    const timestamp = msg.timestamp || msg.createdAt || new Date().toISOString();
                    const isAudio = msg.type === "audio" && msg.audioData;
                    const isPlaying = playingAudioId === (msg.id || idx);
                    return (
                      <div key={msg.id || idx} className={`flex ${isOwn ? "justify-end" : "justify-start"}`} data-testid={`message-${msg.id || idx}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-2xl ${isOwn ? "bg-blue-900/40 text-white/90" : "bg-foreground/[0.04] text-foreground/80"}`}>
                          {isAudio ? (
                            <button 
                              onClick={() => msg.audioData && playAudioMessage(msg.audioData, msg.id || idx)}
                              className="flex items-center gap-2 group"
                              data-testid={`button-play-audio-${msg.id || idx}`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isPlaying ? "bg-blue-500" : "bg-foreground/10 group-hover:bg-foreground/20"}`}>
                                {isPlaying ? <VolumeX className="w-3.5 h-3.5 text-white" /> : <Volume2 className="w-3.5 h-3.5 text-foreground/60" />}
                              </div>
                              <div className="flex flex-col items-start">
                                <span className="text-xs text-foreground/70">{isPlaying ? "Durdurmak için tıkla" : "Sesli mesaj"}</span>
                                <span className="text-[9px] text-muted-foreground/60">{msg.audioDuration ? `${msg.audioDuration}s` : ""}</span>
                              </div>
                            </button>
                          ) : (
                            <p className="text-xs">{content}</p>
                          )}
                          <span className="text-[9px] text-foreground/25 block mt-0.5">{new Date(timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                
                <div className="h-full flex flex-col items-center justify-center">
                  <div>
                    <img src="./system_icons/light_mod_connect.svg" className="w-[77px] h-[77px] dark:hidden opacity-80" alt="Sohbet Seçin" />
                    <img src="./system_icons/dark_mod_connect.svg" className="w-[77px] h-[77px] hidden dark:block opacity-80" alt="Sohbet Seçin" />
                  </div>
                </div>

              )}
            </div>
          </div>

          {selectedContact && (
            <div className="p-2 border-t border-black/5 dark:border-white/5 flex-shrink-0 relative z-10 bg-[#FCFCFC] dark:bg-[#000000]">
              {isRecording ? (
                <div className="flex items-center gap-3 justify-center py-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-foreground/70">Kayıt: {formatDuration(recordingDuration)}</span>
                  </div>
                  <button onClick={cancelVoiceRecording} className="px-3 py-1.5 rounded-lg bg-foreground/[0.05] text-muted-foreground text-xs hover:bg-foreground/[0.1] transition-colors" data-testid="button-cancel-recording">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={stopVoiceRecording} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-500 transition-colors" data-testid="button-stop-recording">
                    Gönder
                  </button>
                </div>
              ) : (
                <div className="flex items-end gap-2 bg-transparent p-1">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedContact || !selectedConversationId}
                    className="p-1.5 mb-[2px] text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleSendAttachment} />
                  
                  <div className="flex-1 min-h-[36px] bg-black/[0.04] dark:bg-white/[0.08] border border-black/5 dark:border-white/5 rounded-3xl flex items-center pr-1 pl-4 relative transition-all focus-within:bg-black/[0.06] dark:focus-within:bg-white/[0.12]">
                    <Input 
                      value={messageInput} 
                      onChange={(e) => setMessageInput(e.target.value)} 
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()} 
                      placeholder="iMessage" 
                      className="bg-transparent border-0 shadow-none focus-visible:ring-0 p-0 text-[14px] h-9 text-foreground placeholder:text-foreground/40" 
                      disabled={!selectedContact || !selectedConversationId} 
                      data-testid="input-message" 
                    />
                    
                    {messageInput.trim() ? (
                      <button 
                        onClick={handleSendMessage}
                        disabled={!selectedContact || !selectedConversationId}
                        className="w-[28px] h-[28px] bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors shadow-sm ml-2 mb-1 mt-1 disabled:opacity-50"
                        data-testid="button-send"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                    ) : (
                      <button 
                        onMouseDown={handleButtonPress}
                        onMouseUp={handleButtonRelease}
                        onMouseLeave={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                        onTouchStart={handleButtonPress}
                        onTouchEnd={handleButtonRelease}
                        disabled={!selectedContact || !selectedConversationId}
                        className="w-[28px] h-[28px] text-foreground/40 hover:text-foreground/70 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ml-2 mb-1 mt-1 disabled:opacity-30"
                        data-testid="button-voice"
                      >
                        <Mic className="w-[18px] h-[18px]" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
      </div>
      
      {/* Livechat Dummy Toggle */}
      <button
        onClick={() => {
          queryClient.setQueryData(['/api/notifications'], (oldData: any) => {
            const newNotif = {
              id: Date.now(),
              type: 'livechat',
              title: 'Canlı Destek',
              message: 'Canlı destek bağlantısı başlatıldı.',
              icon: 'message-square',
              isRead: false,
              createdAt: new Date().toISOString()
            };
            return {
              notifications: [newNotif, ...(oldData?.notifications || [])],
              unreadCount: (oldData?.unreadCount || 0) + 1
            };
          });
        }}
        className="absolute bottom-6 right-6 w-14 h-14 bg-blue-600/90 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(37,99,235,0.4)] backdrop-blur-md transition-all duration-300 hover:scale-105 z-50 group"
      >
        <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
      </button>
    </div>
  );

  if (!ownWindow && (externalOpen || detachedWindow)) {
    return (
      <>
        <div className="w-full max-w-[1265px] h-[80vh] mx-auto mt-[5vh] flex items-center justify-center">
          <img src="./connect-gray.svg" alt="ZenOS İletişim" className="w-[120px] h-[120px] opacity-80" />
        </div>
        {detachedWindow && (
          <WindowPortal target={detachedWindow} onClose={() => setDetachedWindow(null)}>
            {content}
          </WindowPortal>
        )}
      </>
    );
  }

  return content;
}
