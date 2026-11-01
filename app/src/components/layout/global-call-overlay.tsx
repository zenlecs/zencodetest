import { useGlobalCall } from "@/lib/contexts/call-context";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, VolumeX, Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function GlobalCallOverlay() {
  const { 
    inCall, 
    callType, 
    callDuration, 
    isMuted, 
    isVideoEnabled, 
    isSpeakerMuted,
    incomingCall,
    selectedContact,
    localVideoRef,
    remoteVideoRef,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeakerMute,
    isFullscreen,
    setIsFullscreen
  } = useGlobalCall();

  const formatDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <>
      {/* Incoming Call Notification */}
      <AnimatePresence>
        {incomingCall && !inCall && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="fixed top-6 right-6 z-[100] w-80 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg ring-2 ring-white/20 flex-shrink-0">
                <span className="text-xl text-white font-medium">{incomingCall.fromUsername.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium truncate">{incomingCall.fromUsername}</h3>
                <p className="text-white/60 text-sm truncate">{incomingCall.callType === "video" ? "Görüntülü Arama" : "Sesli Arama"}</p>
              </div>
            </div>
            <div className="relative flex items-center justify-end gap-3 mt-4">
              <button 
                onClick={rejectCall} 
                className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white transition-all flex items-center justify-center"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
              <button 
                onClick={answerCall} 
                className="w-10 h-10 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:bg-green-400 transition-all flex items-center justify-center animate-pulse"
              >
                {incomingCall.callType === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Call UI */}
      <AnimatePresence>
        {inCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            drag={!isFullscreen}
            dragMomentum={false}
            className={`fixed z-[90] flex flex-col items-center gap-4 ${
              isFullscreen 
                ? "inset-0 bg-black/95 backdrop-blur-3xl" 
                : "bottom-6 right-6 w-[340px] bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl p-4 cursor-move"
            }`}
          >
            {/* Call Header */}
            <div className={`flex items-center justify-between w-full ${isFullscreen ? "absolute top-6 left-6 right-6 z-10" : ""}`}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-white font-mono">{formatDuration(callDuration)}</span>
              </div>
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)} 
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4 text-white/80" /> : <Maximize2 className="w-4 h-4 text-white/80" />}
              </button>
            </div>

            {/* Video Container */}
            <div className={`relative w-full rounded-2xl overflow-hidden bg-black ${isFullscreen ? "h-[80vh] mt-20" : "aspect-[3/4]"}`}>
              {callType === "video" ? (
                <>
                  <video ref={remoteVideoRef} autoPlay playsInline muted={isSpeakerMuted} className="w-full h-full object-cover" />
                  <div className={`absolute bottom-4 right-4 bg-black rounded-xl overflow-hidden ring-2 ring-white/20 shadow-2xl ${isFullscreen ? "w-48 aspect-video" : "w-24 aspect-[3/4]"}`}>
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-900/40 to-indigo-900/40">
                  <div className={`rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-2xl ${isFullscreen ? "w-40 h-40" : "w-24 h-24"}`}>
                    <span className={`text-white font-medium ${isFullscreen ? "text-5xl" : "text-3xl"}`}>
                      {(selectedContact?.name || selectedContact?.targetUsername || "K").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  {isFullscreen && (
                    <h2 className="text-white text-2xl mt-6 font-medium">{selectedContact?.name || selectedContact?.targetUsername}</h2>
                  )}
                </div>
              )}
            </div>

            {/* Call Controls */}
            <div className={`flex items-center gap-3 ${isFullscreen ? "absolute bottom-10" : ""}`}>
              <button 
                onClick={toggleMute} 
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              
              {callType === "video" && (
                <button 
                  onClick={toggleVideo} 
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${!isVideoEnabled ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}
                >
                  {!isVideoEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              )}
              
              <button 
                onClick={toggleSpeakerMute} 
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSpeakerMuted ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              
              <button 
                onClick={endCall} 
                className="w-14 h-14 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:bg-red-600 transition-all flex items-center justify-center ml-2"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
