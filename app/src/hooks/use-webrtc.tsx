import { useState, useRef, useCallback, useEffect } from "react";

interface UseWebRTCOptions {
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onError?: (error: string) => void;
}

interface CallSignalData {
  type: "offer" | "answer" | "ice-candidate";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTC(options: UseWebRTCOptions = {}) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const sendSignalRef = useRef<((type: string, data: CallSignalData) => void) | null>(null);

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && sendSignalRef.current) {
        sendSignalRef.current("ice-candidate", {
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStream(stream);
        options.onRemoteStream?.(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      options.onConnectionStateChange?.(pc.connectionState);

      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        options.onError?.("Connection lost");
      }
    };

    pc.oniceconnectionstatechange = () => {
      options.onIceConnectionStateChange?.(pc.iceConnectionState);
    };

    return pc;
  }, [options]);

  const startLocalMedia = useCallback(async (video: boolean = true, audio: boolean = true) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      options.onError?.("Failed to access camera/microphone");
      throw error;
    }
  }, [options]);

  const stopLocalMedia = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [localStream]);

  const initiateCall = useCallback(async (
    sendSignal: (type: string, data: CallSignalData) => void,
    videoEnabled: boolean = true
  ) => {
    sendSignalRef.current = sendSignal;
    
    try {
      const stream = await startLocalMedia(videoEnabled, true);
      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: videoEnabled,
      });

      await pc.setLocalDescription(offer);

      sendSignal("offer", {
        type: "offer",
        sdp: offer,
      });

      setIsCallActive(true);
      setIsVideoEnabled(videoEnabled);
    } catch (error) {
      console.error("Failed to initiate call:", error);
      options.onError?.("Failed to start call");
    }
  }, [startLocalMedia, createPeerConnection, options]);

  const answerCall = useCallback(async (
    offer: RTCSessionDescriptionInit,
    sendSignal: (type: string, data: CallSignalData) => void,
    videoEnabled: boolean = true
  ) => {
    sendSignalRef.current = sendSignal;

    try {
      const stream = await startLocalMedia(videoEnabled, true);
      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      while (pendingCandidatesRef.current.length > 0) {
        const candidate = pendingCandidatesRef.current.shift();
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal("answer", {
        type: "answer",
        sdp: answer,
      });

      setIsCallActive(true);
      setIsVideoEnabled(videoEnabled);
    } catch (error) {
      console.error("Failed to answer call:", error);
      options.onError?.("Failed to answer call");
    }
  }, [startLocalMedia, createPeerConnection, options]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));

      while (pendingCandidatesRef.current.length > 0) {
        const candidate = pendingCandidatesRef.current.shift();
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    } catch (error) {
      console.error("Failed to handle answer:", error);
      options.onError?.("Failed to establish connection");
    }
  }, [options]);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;

    if (!pc || !pc.remoteDescription) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Failed to add ICE candidate:", error);
    }
  }, []);

  const endCall = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    stopLocalMedia();

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setRemoteStream(null);
    setIsCallActive(false);
    setConnectionState(null);
    pendingCandidatesRef.current = [];
    sendSignalRef.current = null;
  }, [stopLocalMedia]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, [localStream]);

  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  const setLocalVideoElement = useCallback((element: HTMLVideoElement | null) => {
    localVideoRef.current = element;
    if (element && localStream) {
      element.srcObject = localStream;
    }
  }, [localStream]);

  const setRemoteVideoElement = useCallback((element: HTMLVideoElement | null) => {
    remoteVideoRef.current = element;
    if (element && remoteStream) {
      element.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return {
    isCallActive,
    isMuted,
    isVideoEnabled,
    connectionState,
    localStream,
    remoteStream,
    initiateCall,
    answerCall,
    handleAnswer,
    handleIceCandidate,
    endCall,
    toggleMute,
    toggleVideo,
    setLocalVideoElement,
    setRemoteVideoElement,
  };
}
