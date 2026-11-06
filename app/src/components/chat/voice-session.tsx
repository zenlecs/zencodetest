import { useEffect } from "react";
import { Conversation } from "@elevenlabs/client";
import { setVoiceCue, setVoiceSpeaking } from "@/lib/voice-speaking";

let sessionLock: Promise<void> = Promise.resolve();

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
        await sessionLock;
        if (cancelled) return;
        let signedUrl = "";
        let lastError: unknown;
        for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
          try {
            signedUrl = await openSignedUrl(abort.signal);
            break;
          } catch (err) {
            lastError = err;
            if (cancelled || abort.signal.aborted) return;
            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          }
        }
        if (!signedUrl) throw lastError instanceof Error ? lastError : new Error("Ses oturumu açılamadı.");
        if (cancelled) return;
        conversation = await Conversation.startSession({
          signedUrl,
          connectionType: "websocket",
          onModeChange: ({ mode }) => {
            if (cancelled) return;
            setVoiceSpeaking(mode === "speaking");
          },
          onMessage: ({ message, role }) => {
            if (cancelled || role !== "agent") return;
            const phrase = message.split(/\s+/).slice(0, 4).join(" ");
            if (phrase) setVoiceCue(phrase);
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

    const finished = run();

    return () => {
      cancelled = true;
      abort.abort();
      setVoiceSpeaking(false);
      setVoiceCue("");
      window.electron?.send("voice-session-stop");
      sessionLock = finished.then(async () => {
        await conversation?.endSession().catch(() => undefined);
        conversation = null;
      }).then(() => undefined, () => undefined);
    };
  }, [active]);

  return null;
}
