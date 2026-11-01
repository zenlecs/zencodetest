import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useWebSocket } from "./websocket-context";
import { CallEncryption, generateSessionId } from "@/lib/crypto";

interface IncomingCall {
  fromUserId: number;
  fromUsername: string;
  conversationId: number;
  offer: RTCSessionDescriptionInit;
  callType: "audio" | "video";
}

interface CallContextType {
  inCall: boolean;
  callType: "audio" | "video" | null;
  callDuration: number;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerMuted: boolean;
  incomingCall: IncomingCall | null;
  selectedContact: any | null;
  webrtc: ReturnType<typeof useWebRTC>;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  startVideoCall: (targetId: number, conversationId: number, contact: any) => Promise<void>;
  startAudioCall: (targetId: number, conversationId: number, contact: any) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeakerMute: () => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video" | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callEncryptionRef = useRef<CallEncryption>(new CallEncryption());
  const pendingRemoteKeyRef = useRef<string | null>(null);

  const { isConnected, sendCallSignal, addCallSignalListener, removeCallSignalListener } = useWebSocket();
  const webrtc = useWebRTC({ onError: console.error });

  const startCallTimer = useCallback(() => {
    setCallDuration(0);
    callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallDuration(0);
  }, []);

  // Handle incoming websocket signals for calls
  const handleCallSignal = useCallback(async (event: any) => {
    if (event.type === "offer" && event.fromUserId && event.fromUsername) {
      if (event.data?.publicKey) pendingRemoteKeyRef.current = event.data.publicKey;
      setIncomingCall({ 
        fromUserId: event.fromUserId, 
        fromUsername: event.fromUsername, 
        conversationId: event.conversationId, 
        offer: event.data?.sdp, 
        callType: event.data?.callType || "video" 
      });
      setCurrentConversationId(event.conversationId);
      // Create a mock contact for incoming call UI
      setSelectedContact({ id: event.fromUserId, name: event.fromUsername, targetUsername: event.fromUsername });
    } else if (event.type === "answer" && webrtc.isCallActive) {
      webrtc.handleAnswer(event.data?.sdp);
      if (event.data?.publicKey) {
        try { await callEncryptionRef.current.setRemotePublicKey(event.data.publicKey as any); } catch {}
      }
    } else if (event.type === "ice-candidate") {
      webrtc.handleIceCandidate(event.data?.candidate);
    } else if (event.type === "call-end" || event.type === "call-reject" || event.type === "user_offline" || event.type === "unauthorized") {
      webrtc.endCall(); setInCall(false); setIncomingCall(null); stopCallTimer(); callEncryptionRef.current.destroy();
      setCurrentConversationId(null);
    }
  }, [webrtc, stopCallTimer]);

  useEffect(() => {
    addCallSignalListener(handleCallSignal);
    return () => removeCallSignalListener(handleCallSignal);
  }, [addCallSignalListener, removeCallSignalListener, handleCallSignal]);

  useEffect(() => {
    if (localVideoRef.current) webrtc.setLocalVideoElement(localVideoRef.current);
    if (remoteVideoRef.current) webrtc.setRemoteVideoElement(remoteVideoRef.current);
  }, [inCall, webrtc.localStream, webrtc.remoteStream]);

  const startVideoCall = async (targetId: number, conversationId: number, contact: any) => {
    setSelectedContact(contact);
    setCurrentConversationId(conversationId);
    const pk = await callEncryptionRef.current.initialize();
    await webrtc.initiateCall((t, d) => sendCallSignal(t as any, targetId, conversationId, { ...d, publicKey: pk, callType: "video", sessionId: generateSessionId() }), true);
    setCallType("video"); setInCall(true); startCallTimer();
  };

  const startAudioCall = async (targetId: number, conversationId: number, contact: any) => {
    setSelectedContact(contact);
    setCurrentConversationId(conversationId);
    const pk = await callEncryptionRef.current.initialize();
    await webrtc.initiateCall((t, d) => sendCallSignal(t as any, targetId, conversationId, { ...d, publicKey: pk, callType: "audio", sessionId: generateSessionId() }), false);
    setCallType("audio"); setInCall(true); startCallTimer();
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    const pk = await callEncryptionRef.current.initialize();
    if (pendingRemoteKeyRef.current) await callEncryptionRef.current.setRemotePublicKey(pendingRemoteKeyRef.current as any);
    await webrtc.answerCall(
      incomingCall.offer,
      (t, d) => sendCallSignal(t as any, incomingCall.fromUserId, incomingCall.conversationId, { ...d, publicKey: pk }),
      incomingCall.callType === "video"
    );
    setCallType(incomingCall.callType);
    setInCall(true); setIncomingCall(null); startCallTimer();
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    sendCallSignal("call-reject", incomingCall.fromUserId, incomingCall.conversationId, {});
    setIncomingCall(null);
    pendingRemoteKeyRef.current = null;
  };

  const endCall = () => {
    if (selectedContact && currentConversationId) {
      const targetId = selectedContact.targetUserId || selectedContact.id;
      sendCallSignal("call-end", targetId, currentConversationId, {});
    }
    webrtc.endCall(); setInCall(false); stopCallTimer(); callEncryptionRef.current.destroy(); pendingRemoteKeyRef.current = null;
    setCurrentConversationId(null);
  };

  return (
    <CallContext.Provider value={{
      inCall,
      callType,
      callDuration,
      isMuted: webrtc.isMuted,
      isVideoEnabled: webrtc.isVideoEnabled,
      isSpeakerMuted,
      incomingCall,
      selectedContact,
      webrtc,
      localVideoRef,
      remoteVideoRef,
      startVideoCall,
      startAudioCall,
      answerCall,
      rejectCall,
      endCall,
      toggleMute: webrtc.toggleMute,
      toggleVideo: webrtc.toggleVideo,
      toggleSpeakerMute: () => setIsSpeakerMuted(!isSpeakerMuted),
      isFullscreen,
      setIsFullscreen
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useGlobalCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useGlobalCall must be used within CallProvider");
  return context;
}
