import { useEffect } from "react";
import { Conversation } from "@elevenlabs/client";
import { setVoiceSpeaking } from "@/lib/voice-speaking";

async function openSignedUrl(signal: AbortSignal): Promise<string> {
  const response = await fetch("/api/voice/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as { signedUrl?: unknown; error?: unknown };
  if (!response.ok || typeof payload.signedUrl !== "string") {
    throw new Error(typeof payload.error === "string" ? payload.error : "Ses oturumu açılamadı.");
  }
  return payload.signedUrl;
}

export function VoiceSession({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let conversation: Awaited<ReturnType<typeof Conversation.startSession>> | null = null;
    const abort = new AbortController();

    window.electron?.send("voice-session-start");

    const run = async () => {
      try {
        const signedUrl = await openSignedUrl(abort.signal);
        if (cancelled) return;
        conversation = await Conversation.startSession({
          signedUrl,
          connectionType: "websocket",
          onModeChange: ({ mode }) => {
            if (!cancelled) setVoiceSpeaking(mode === "speaking");
          },
          onInterruption: () => {
            if (!cancelled) setVoiceSpeaking(false);
          },
          onError: (message) => {
            console.error("Ses oturumu:", message);
          },
          onDisconnect: (details) => {
            if (!cancelled && details.reason !== "user") console.error("Ses bağlantısı koptu.");
          },
        });
        if (cancelled) {
          await conversation.endSession();
          conversation = null;
          return;
        }
        conversation.setVolume({ volume: 1 });
      } catch (err) {
        if (cancelled || abort.signal.aborted) return;
        console.error(err instanceof Error ? err.message : "Ses oturumu açılamadı.");
      }
    };

    void run();

    return () => {
      cancelled = true;
      abort.abort();
      setVoiceSpeaking(false);
      window.electron?.send("voice-session-stop");
      const current = conversation;
      conversation = null;
      void current?.endSession().catch(() => undefined);
    };
  }, [active]);

  return null;
}
