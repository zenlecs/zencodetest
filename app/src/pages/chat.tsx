import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageSquare } from "lucide-react";
import { consumeChatStream, describeChatFailure } from "@/lib/ai-chat-stream";
import {
  ChatComposer,
  DEFAULT_SELECTION,
  type ComposerSelection,
} from "@/components/chat/chat-composer";
import { VerticalChatComposer } from "@/components/chat/vertical-chat-composer";
import { VoiceSession } from "@/components/chat/voice-session";

interface AIConversation {
  id: number;
  userId: number;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

interface AIChatMessage {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

/** Mesaj listesi ve composer aynı sahneyi paylaşır; pencere küçülünce %100, büyüyünce 1360px. */
const CHAT_STAGE = "mx-auto w-full min-w-0 max-w-[1360px] px-4 sm:px-6 lg:px-8";
const WRAP = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]";
const PANEL_MAX_W = 520;
const ICON_SIZE = 44;
/** Studio arama çubuğuyla aynı iOS Spotlight yayı. */
const IOS_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.75 };

type ComposerMode = "docked" | "panel" | "icon";
type IconOrigin = "docked" | "panel";
type Point = { x: number; y: number };

function dockedFrame(pageWidth: number, pageHeight: number, dockHeight: number) {
  const stageWidth = Math.min(1360, pageWidth);
  const pad = pageWidth >= 1024 ? 32 : pageWidth >= 640 ? 24 : 16;
  const contentWidth = Math.max(0, stageWidth - pad * 2);
  const width = contentWidth * 0.65;
  const left = (pageWidth - stageWidth) / 2 + pad + (contentWidth - width) / 2;
  return {
    left,
    top: Math.max(8, pageHeight - dockHeight - 20),
    width,
    height: Math.max(dockHeight, 1),
    radius: 18,
  };
}

type BeatKind = "prose" | "heading" | "list" | "code" | "rule";

interface PresentationBeat {
  kind: BeatKind;
  text: string;
}

interface LiveAnswer {
  text: string;
  settled: boolean;
}

function isHeadingLine(line: string): boolean {
  return /^#{1,3} /.test(line);
}

function isListLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed);
}

function isRuleLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "---" || trimmed === "***";
}

/** Cümle sonu: noktalama + boşluk. Kod içi ve ondalık sayılar bölünmez. */
function splitSentences(paragraph: string): string[] {
  const sentences: string[] = [];
  let current = "";
  let inlineCode = false;

  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i];
    if (ch === "`") inlineCode = !inlineCode;
    current += ch;

    if (!inlineCode && (ch === "." || ch === "!" || ch === "?") && paragraph[i + 1] === " ") {
      const following = paragraph[i + 2];
      if (following !== undefined) {
        const sentence = current.trim();
        if (sentence) sentences.push(sentence);
        current = "";
        i += 1;
      }
    }
  }

  const tail = current.trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/**
 * Asistan metnini sunum vuruşlarına böler.
 * Akış bitmemişse son cümle / paragraf / kapanmamış kod bekletilir.
 */
function splitIntoBeats(content: string, settled: boolean): PresentationBeat[] {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return [];

  const lines = normalized.split("\n");
  const beats: PresentationBeat[] = [];
  let index = 0;

  const lineComplete = (lineIndex: number) => {
    if (settled) return true;
    if (lineIndex < lines.length - 1) return true;
    return normalized.endsWith("\n");
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().startsWith("```")) {
      const codeLines = [line];
      let cursor = index + 1;
      let closed = false;
      while (cursor < lines.length) {
        codeLines.push(lines[cursor]);
        if (lines[cursor].trim().startsWith("```")) {
          closed = true;
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      if (!closed && !settled) return beats;
      beats.push({ kind: "code", text: codeLines.join("\n") });
      index = cursor;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isHeadingLine(line) || isListLine(line) || isRuleLine(line)) {
      if (!lineComplete(index)) return beats;
      const kind: BeatKind = isHeadingLine(line) ? "heading" : isRuleLine(line) ? "rule" : "list";
      beats.push({ kind, text: line });
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    let cursor = index;
    while (
      cursor < lines.length &&
      lines[cursor].trim() &&
      !lines[cursor].trim().startsWith("```") &&
      !isHeadingLine(lines[cursor]) &&
      !isListLine(lines[cursor]) &&
      !isRuleLine(lines[cursor])
    ) {
      paragraphLines.push(lines[cursor].trim());
      cursor += 1;
    }

    const paragraph = paragraphLines.join(" ").trim();
    const paragraphComplete = cursor < lines.length || settled;
    const sentences = splitSentences(paragraph);

    if (!paragraphComplete) {
      const last = sentences[sentences.length - 1];
      const lastDone = !!last && /[.!?]$/.test(last);
      const emitCount = lastDone ? sentences.length : Math.max(0, sentences.length - 1);
      for (let sentenceIndex = 0; sentenceIndex < emitCount; sentenceIndex++) {
        beats.push({ kind: "prose", text: sentences[sentenceIndex] });
      }
      return beats;
    }

    for (const sentence of sentences) {
      beats.push({ kind: "prose", text: sentence });
    }
    index = cursor;
  }

  return beats;
}

function beatGap(kind: BeatKind): string {
  switch (kind) {
    case "heading":
      return "mb-4";
    case "list":
      return "mb-3";
    case "rule":
      return "mb-6";
    default:
      return "mb-8";
  }
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderFormattedInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-[#1d1d1f] dark:text-[#ffffff]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[0.86em] text-[#1d1d1f] dark:bg-white/[0.08] dark:text-[#ffffff]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function AppleEditorialText({ content }: { content: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (codeText: string, index: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeBlockIndex = 0;

  const pushCodeBlock = (codeText: string, key: string) => {
    const currentIndex = codeBlockIndex++;
    blocks.push(
      <div key={key} className="max-w-full min-w-0 overflow-hidden rounded-lg border border-black/[0.08] bg-[#272729] text-sm text-[#f5f5f7] dark:border-white/[0.12]">
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1d1d1f] px-4 py-2 text-xs text-[#7a7a7a]">
          <span className="font-mono">kod</span>
          <button
            type="button"
            onClick={() => handleCopyCode(codeText, currentIndex)}
            className="flex items-center gap-1 transition-colors hover:text-[#f5f5f7] active:scale-95"
          >
            {copiedIndex === currentIndex ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#0066cc]" />
                <span className="text-[#0066cc]">Kopyalandı</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Kopyala</span>
              </>
            )}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
          <code>{codeText}</code>
        </pre>
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        pushCodeBlock(codeBuffer.join("\n"), `code-${i}`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      blocks.push(<div key={`hr-${i}`} className="h-px bg-black/[0.06] dark:bg-white/[0.08]" />);
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${i}`} className={`${WRAP} text-[30px] font-semibold leading-[1.15] tracking-[-0.4px] text-[#1d1d1f] dark:text-[#ffffff]`}>
          {renderFormattedInline(line.replace(/^### /, ""))}
        </h3>
      );
      continue;
    }

    if (line.startsWith("## ") || line.startsWith("# ")) {
      blocks.push(
        <h2 key={`h2-${i}`} className={`${WRAP} text-[36px] font-semibold leading-[1.12] tracking-[-0.45px] text-[#1d1d1f] dark:text-[#ffffff]`}>
          {renderFormattedInline(line.replace(/^#{1,2} /, ""))}
        </h2>
      );
      continue;
    }

    if (line.trim().startsWith("- ") || line.trim().startsWith("* ") || /^\d+\.\s/.test(line.trim())) {
      const isOrdered = /^\d+\.\s/.test(line.trim());
      const rawText = isOrdered ? line.trim().replace(/^\d+\.\s/, "") : line.trim().substring(2);
      blocks.push(
        <div key={`li-${i}`} className="flex min-w-0 items-start gap-3">
          <span className="mt-[0.35em] select-none text-[22px] leading-[1.5] text-[#0066cc] dark:text-[#2997ff]">
            {isOrdered ? line.trim().match(/^\d+\./)?.[0] : "•"}
          </span>
          <div className={`${WRAP} flex-1 text-[22px] leading-[1.5] tracking-[-0.22px] text-[#1d1d1f] dark:text-[#f5f5f7]`}>
            {renderFormattedInline(rawText)}
          </div>
        </div>
      );
      continue;
    }

    if (line.trim()) {
      blocks.push(
        <p key={`p-${i}`} className={`${WRAP} text-[22px] leading-[1.5] tracking-[-0.22px] text-[#1d1d1f] dark:text-[#f5f5f7]`}>
          {renderFormattedInline(line)}
        </p>
      );
    }
  }

  if (inCodeBlock) {
    pushCodeBlock(codeBuffer.join("\n"), "code-tail");
  }

  return <div className={`${WRAP} font-google-sans select-text`}>{blocks}</div>;
}

function AssistantBeats({ beats, animate }: { beats: PresentationBeat[]; animate: boolean }) {
  return (
    <>
      {beats.map((beat, index) => {
        const body = <AppleEditorialText content={beat.text} />;
        const className = beatGap(beat.kind);
        if (!animate) {
          return (
            <div key={`${beat.kind}-${index}`} className={className}>
              {body}
            </div>
          );
        }
        return (
          <motion.div
            key={`${beat.kind}-${index}`}
            className={className}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {body}
          </motion.div>
        );
      })}
    </>
  );
}

function UserTurn({ content, time }: { content: string; time: string }) {
  return (
    <div className="mb-10 flex w-full min-w-0 justify-end">
      <div className="w-fit min-w-0 max-w-full text-right" style={{ maxWidth: "min(70%, 34rem)" }}>
        <div className="mb-1.5 flex items-center justify-end gap-2">
          <span className="select-none text-[11px] text-[#7a7a7a]/60">{time}</span>
          <span className="font-google-sans select-none text-[13px] font-medium tracking-[-0.224px] text-[#7a7a7a]">
            Siz
          </span>
        </div>
        <p className={`${WRAP} font-google-sans whitespace-pre-wrap text-right text-[18px] leading-[1.5] tracking-[-0.22px] text-[#1d1d1f] select-text dark:text-[#f5f5f7]`}>
          {content}
        </p>
      </div>
    </div>
  );
}

function AssistantTurn({
  time,
  streaming,
  children,
}: {
  time?: string;
  streaming?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-14 flex w-full min-w-0 justify-start">
      <div className="w-full min-w-0 max-w-[46rem] text-left">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-google-sans select-none text-[13px] font-semibold tracking-[-0.224px] text-[#0066cc] dark:text-[#2997ff]">
            Zenlecs+
          </span>
          {streaming ? (
            <span className="animate-pulse text-[11px] text-[#0066cc]">yanıtlıyor...</span>
          ) : time ? (
            <span className="select-none text-[11px] text-[#7a7a7a]/60">{time}</span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function WritingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2 text-[#7a7a7a]">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0066cc]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0066cc] [animation-delay:0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0066cc] [animation-delay:0.4s]" />
    </div>
  );
}

export default function AIChatPage() {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [composerSelection, setComposerSelection] = useState<ComposerSelection>(DEFAULT_SELECTION);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingUserQuery, setPendingUserQuery] = useState<string | null>(null);
  const [liveAnswer, setLiveAnswer] = useState<LiveAnswer | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [revealHoldDone, setRevealHoldDone] = useState(false);
  const [turnPersisted, setTurnPersisted] = useState(false);
  const [presentationTurn, setPresentationTurn] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("docked");
  const [panelPos, setPanelPos] = useState<Point>({ x: 24, y: 24 });
  const [panelSize, setPanelSize] = useState({ width: PANEL_MAX_W, height: PANEL_MAX_W * 0.75 });
  const [iconPos, setIconPos] = useState<Point>({ x: 24, y: 24 });
  const [iconOrigin, setIconOrigin] = useState<IconOrigin>("panel");
  const [composerDragging, setComposerDragging] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [dockHeight, setDockHeight] = useState(168);
  const [composerClipping, setComposerClipping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnRef = useRef(0);
  const baselineIdsRef = useRef<Set<number>>(new Set());
  const liveAnswerRef = useRef<LiveAnswer | null>(null);
  const skipResumeRef = useRef(false);
  const didResumeRef = useRef(false);
  const launchQuerySeenRef = useRef(false);
  const conversationIdRef = useRef<number | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const panelShellRef = useRef<HTMLDivElement>(null);
  const dockMeasureRef = useRef<HTMLDivElement>(null);
  const panelPosRef = useRef(panelPos);
  const panelSizeRef = useRef(panelSize);
  const iconPosRef = useRef(iconPos);
  const iconOriginRef = useRef(iconOrigin);
  const composerDragRef = useRef<{
    pointerId: number;
    kind: "panel" | "icon";
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  liveAnswerRef.current = liveAnswer;
  panelPosRef.current = panelPos;
  panelSizeRef.current = panelSize;
  iconPosRef.current = iconPos;
  iconOriginRef.current = iconOrigin;

  if (!launchQuerySeenRef.current) {
    launchQuerySeenRef.current = true;
    const launchParams = new URLSearchParams(window.location.search || window.location.hash.split("?")[1] || "");
    if (launchParams.get("q")?.trim()) {
      skipResumeRef.current = true;
      didResumeRef.current = true;
    }
  }

  useEffect(() => {
    conversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const { data: conversations = [], refetch: refetchConversations } = useQuery<AIConversation[]>({
    queryKey: ["/api/ai/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/ai/conversations");
      if (!res.ok) throw new Error("Sohbetler alınamadı");
      return res.json();
    },
  });

  // İlk açılışta son sohbeti sürdür. Kullanıcı yeni sohbet veya silme seçtiyse geri yükleme.
  useEffect(() => {
    if (skipResumeRef.current || didResumeRef.current) return;
    if (selectedConversationId) {
      didResumeRef.current = true;
      return;
    }
    if (conversations.length === 0) return;
    didResumeRef.current = true;
    setSelectedConversationId(conversations[0].id);
  }, [conversations, selectedConversationId]);

  const { data: messages = [], refetch: refetchMessages } = useQuery<AIChatMessage[]>({
    queryKey: ["/api/ai/conversations", selectedConversationId, "messages"],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const res = await fetch(`/api/ai/conversations/${selectedConversationId}/messages`);
      if (!res.ok) throw new Error("Mesajlar alınamadı");
      return res.json();
    },
    enabled: !!selectedConversationId,
  });

  const threadMessages =
    selectedConversationId == null
      ? []
      : messages.filter((message) => message.conversationId === selectedConversationId);

  const visibleMessages = liveAnswer
    ? threadMessages.filter((message) => baselineIdsRef.current.has(message.id))
    : threadMessages;

  const readyBeats = liveAnswer ? splitIntoBeats(liveAnswer.text, liveAnswer.settled) : [];
  const visibleBeats = readyBeats.slice(0, revealedCount);
  const stillRevealing = !!liveAnswer && (!liveAnswer.settled || revealedCount < readyBeats.length);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, revealedCount, pendingUserQuery, liveAnswer?.text]);

  useEffect(() => {
    if (!liveAnswerRef.current) return;

    let timer = 0;
    const tick = () => {
      const current = liveAnswerRef.current;
      if (!current) return;
      const ready = splitIntoBeats(current.text, current.settled);
      setRevealedCount((count) => (count >= ready.length ? count : count + 1));
      timer = window.setTimeout(tick, 520);
    };

    timer = window.setTimeout(tick, 80);
    return () => window.clearTimeout(timer);
    // Zamanlayıcı tur boyunca bir kez kurulur; akan metin ref üzerinden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationTurn]);

  useEffect(() => {
    if (!liveAnswer?.settled) return;
    const beats = splitIntoBeats(liveAnswer.text, true);
    if (revealedCount < beats.length) return;
    const timer = window.setTimeout(() => setRevealHoldDone(true), 480);
    return () => window.clearTimeout(timer);
  }, [liveAnswer?.settled, liveAnswer?.text, revealedCount]);

  useEffect(() => {
    if (!revealHoldDone || !turnPersisted || !liveAnswer?.settled) return;
    const hasNewAssistant =
      liveAnswer.text.trim() === "" ||
      messages.some((message) => message.role === "assistant" && !baselineIdsRef.current.has(message.id));
    if (!hasNewAssistant) return;
    setLiveAnswer(null);
    setPendingUserQuery(null);
    setRevealHoldDone(false);
  }, [revealHoldDone, turnPersisted, liveAnswer, messages]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search || window.location.hash.split("?")[1] || "");
    const initialQuery = searchParams.get("q");
    if (initialQuery && initialQuery.trim()) {
      handleSendMessage(initialQuery.trim());
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.pathname + (url.hash.split("?")[0] || ""));
    }
    // İlk yüklemedeki `?q=` yalnızca bir kez gönderilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const resetPresentation = () => {
    turnRef.current += 1;
    setIsStreaming(false);
    setLiveAnswer(null);
    setPendingUserQuery(null);
    setRevealedCount(0);
    setRevealHoldDone(false);
    setTurnPersisted(false);
  };

  const handleSendMessage = async (
    textToSend?: string,
    options?: {
      channel?: "text" | "voice";
      signal?: AbortSignal;
      onChunk?: (chunk: string, full: string) => void;
    }
  ) => {
    const content = (textToSend ?? inputMessage).trim();
    const voice = options?.channel === "voice";
    if (!content || (!voice && isStreaming) || options?.signal?.aborted) return;
    if (voice) abortRef.current?.abort();

    const controller = new AbortController();
    options?.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    abortRef.current = controller;
    const turn = ++turnRef.current;

    baselineIdsRef.current = new Set(threadMessages.map((message) => message.id));
    setInputMessage("");
    setPendingUserQuery(content);
    setIsStreaming(true);
    setErrorMessage(null);
    setRevealedCount(0);
    setRevealHoldDone(false);
    setTurnPersisted(false);
    setPresentationTurn((value) => value + 1);
    setLiveAnswer({ text: "", settled: false });
    let streamed = "";

    try {
      const response = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "x-zenos-stream": "1",
        },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          content,
          channel: voice ? "voice" : undefined,
          model: composerSelection.model,
          style: composerSelection.styleId,
          skills: composerSelection.skillIds,
          attachments: composerSelection.attachments,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await describeChatFailure(response));
      }

      await consumeChatStream(response, async (event) => {
        if (turnRef.current !== turn) return;
        if (event.type === "meta") {
          conversationIdRef.current = event.conversationId;
          if (event.conversationId !== selectedConversationId) {
            setSelectedConversationId(event.conversationId);
          }
          const usedModel = event.model;
          if (usedModel && !voice) {
            setComposerSelection((prev) =>
              prev.model === usedModel ? prev : { ...prev, model: usedModel }
            );
          }
        } else if (event.type === "chunk") {
          streamed += event.chunk;
          options?.onChunk?.(event.chunk, streamed);
          setLiveAnswer({ text: streamed, settled: false });
        } else if (event.type === "done") {
          setLiveAnswer((prev) => ({
            text: prev?.text ?? "",
            settled: true,
          }));
          await refetchMessages();
          await refetchConversations();
          if (turnRef.current === turn) setTurnPersisted(true);
        }
      });
    } catch (err) {
      if (turnRef.current !== turn) return;
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted && voice) {
        setLiveAnswer(null);
        void refetchMessages();
        void refetchConversations();
        return;
      }
      setLiveAnswer(null);
      setPendingUserQuery(null);
      setRevealHoldDone(false);
      setTurnPersisted(false);
      if (!aborted) {
        console.error("Chat streaming failed", err);
        setErrorMessage(
          err instanceof Error && err.message ? err.message : "Sohbet başlatılamadı."
        );

        const refreshed = await refetchConversations();
        const availableIds = (refreshed.data ?? []).map((conversation) => conversation.id);
        if (selectedConversationId && !availableIds.includes(selectedConversationId)) {
          setSelectedConversationId(null);
        }
        refetchMessages();
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (turnRef.current === turn) {
        setIsStreaming(false);
        if (!voice) inputRef.current?.focus();
      }
    }
  };

  const holdBlankChat = () => {
    skipResumeRef.current = true;
    didResumeRef.current = true;
  };

  const handleStartNewChat = () => {
    abortRef.current?.abort();
    holdBlankChat();
    resetPresentation();
    setSelectedConversationId(null);
    setInputMessage("");
    setErrorMessage(null);
    setComposerSelection((previous) => ({ ...previous, attachments: [] }));
    inputRef.current?.focus();
  };

  const handleSelectConversation = (id: number) => {
    if (id === selectedConversationId || isDeleting) return;
    abortRef.current?.abort();
    holdBlankChat();
    resetPresentation();
    setSelectedConversationId(id);
    setInputMessage("");
    setErrorMessage(null);
    setComposerSelection((previous) => ({ ...previous, attachments: [] }));
    inputRef.current?.focus();
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversationId || isDeleting) return;
    const conversationId = selectedConversationId;
    abortRef.current?.abort();
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/ai/conversations/${conversationId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await describeChatFailure(response));
      }

      queryClient.setQueryData<AIConversation[]>(["/api/ai/conversations"], (current) =>
        (current ?? []).filter((conversation) => conversation.id !== conversationId)
      );
      queryClient.removeQueries({ queryKey: ["/api/ai/conversations", conversationId, "messages"] });
      holdBlankChat();
      resetPresentation();
      setSelectedConversationId(null);
      setInputMessage("");
      setComposerSelection((previous) => ({ ...previous, attachments: [] }));
      void refetchConversations();
      inputRef.current?.focus();
    } catch (err) {
      console.error("Delete conversation failed", err);
      setErrorMessage(err instanceof Error && err.message ? err.message : "Sohbet silinemedi.");
    } finally {
      setIsDeleting(false);
    }
  };

  const fitPanel = () => {
    const page = pageRef.current;
    if (!page) return { width: PANEL_MAX_W, height: PANEL_MAX_W * 0.75 };
    const maxW = Math.max(220, page.clientWidth - 24);
    const maxH = Math.max(180, page.clientHeight - 24);
    let width = Math.min(PANEL_MAX_W, maxW);
    let height = width * 0.75;
    if (height > maxH) {
      height = maxH;
      width = height * (4 / 3);
    }
    return { width, height };
  };

  const clampPoint = (x: number, y: number, width: number, height: number): Point => {
    const page = pageRef.current;
    if (!page) return { x, y };
    return {
      x: Math.min(Math.max(8, x), Math.max(8, page.clientWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, page.clientHeight - height - 8)),
    };
  };

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const sync = () => {
      setViewport({ width: page.clientWidth, height: page.clientHeight });
      const size = fitPanel();
      panelSizeRef.current = size;
      setPanelSize(size);
      setPanelPos((current) => {
        const next = clampPoint(current.x, current.y, size.width, size.height);
        panelPosRef.current = next;
        return next;
      });
      setIconPos((current) => {
        const next = clampPoint(current.x, current.y, ICON_SIZE, ICON_SIZE);
        iconPosRef.current = next;
        return next;
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    // Yay bitmeden kutu dardır; o andaki kırılım yüksekliği geri açılınca kutuyu şişirir.
    if (composerMode !== "docked" || composerClipping) return;
    const el = dockMeasureRef.current;
    const page = pageRef.current;
    if (!el || !page) return;
    const settledWidth = dockedFrame(page.clientWidth, page.clientHeight, 0).width;
    const update = () => {
      const shell = panelShellRef.current;
      if (!shell || shell.offsetWidth < settledWidth * 0.92) return;
      const next = el.offsetHeight;
      if (next > 0) setDockHeight((current) => (Math.abs(current - next) > 1 ? next : current));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [composerMode, composerClipping, viewport.width, inputMessage, composerSelection.attachments.length]);

  useEffect(() => {
    if (!composerDragging) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [composerDragging]);

  const openPanel = () => {
    const page = pageRef.current;
    const size = fitPanel();
    panelSizeRef.current = size;
    setPanelSize(size);
    const pos = page
      ? clampPoint((page.clientWidth - size.width) / 2, (page.clientHeight - size.height) / 2, size.width, size.height)
      : { x: 24, y: 24 };
    panelPosRef.current = pos;
    setPanelPos(pos);
    setComposerClipping(true);
    setComposerMode("panel");
    window.setTimeout(() => inputRef.current?.focus(), 180);
  };

  const dockComposer = () => {
    setComposerClipping(true);
    setComposerMode("docked");
    window.setTimeout(() => inputRef.current?.focus(), 180);
  };

  const minimizeComposer = (origin: IconOrigin) => {
    const page = pageRef.current;
    const shell = panelShellRef.current;
    const pos = page && shell
      ? (() => {
          const rect = shell.getBoundingClientRect();
          const pageRect = page.getBoundingClientRect();
          return clampPoint(
            rect.left - pageRect.left + rect.width / 2 - ICON_SIZE / 2,
            rect.top - pageRect.top + rect.height / 2 - ICON_SIZE / 2,
            ICON_SIZE,
            ICON_SIZE,
          );
        })()
      : { x: 24, y: 24 };
    iconPosRef.current = pos;
    iconOriginRef.current = origin;
    setIconPos(pos);
    setIconOrigin(origin);
    setComposerClipping(true);
    setComposerMode("icon");
  };

  const expandIcon = () => {
    if (iconOriginRef.current === "docked") {
      setComposerClipping(true);
      setComposerMode("docked");
      window.setTimeout(() => inputRef.current?.focus(), 180);
      return;
    }
    const size = fitPanel();
    panelSizeRef.current = size;
    setPanelSize(size);
    const pos = clampPoint(
      iconPosRef.current.x + ICON_SIZE / 2 - size.width / 2,
      iconPosRef.current.y + ICON_SIZE / 2 - size.height / 2,
      size.width,
      size.height,
    );
    panelPosRef.current = pos;
    setPanelPos(pos);
    setComposerClipping(true);
    setComposerMode("panel");
    window.setTimeout(() => inputRef.current?.focus(), 180);
  };

  const beginComposerDrag = (
    kind: "panel" | "icon",
    event: React.PointerEvent<HTMLDivElement>,
    origin: Point,
  ) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const shell = panelShellRef.current;
    const page = pageRef.current;
    let originPoint = origin;
    if (shell && page) {
      const rect = shell.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      originPoint = { x: rect.left - pageRect.left, y: rect.top - pageRect.top };
      if (kind === "panel") {
        panelPosRef.current = originPoint;
        setPanelPos(originPoint);
      } else {
        iconPosRef.current = originPoint;
        setIconPos(originPoint);
      }
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sentetik işaretçide yakalama olmayabilir.
    }
    setComposerDragging(true);
    composerDragRef.current = {
      pointerId: event.pointerId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originX: originPoint.x,
      originY: originPoint.y,
      moved: false,
    };
  };

  const moveComposerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = composerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    setComposerDragging(true);
    const size = drag.kind === "icon" ? { width: ICON_SIZE, height: ICON_SIZE } : panelSizeRef.current;
    const next = clampPoint(drag.originX + dx, drag.originY + dy, size.width, size.height);
    if (drag.kind === "icon") {
      iconPosRef.current = next;
      setIconPos(next);
    } else {
      panelPosRef.current = next;
      setPanelPos(next);
    }
  };

  const endComposerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = composerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    composerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setComposerDragging(false);
  };

  const composerProps = {
    value: inputMessage,
    onValueChange: setInputMessage,
    selection: composerSelection,
    onSelectionChange: setComposerSelection,
    onSubmit: () => handleSendMessage(),
    onToggleVoice: () => setVoiceOpen((open) => !open),
    voiceActive: voiceOpen,
    disabled: isStreaming || isDeleting,
    inputRef,
    onNewChat: handleStartNewChat,
    onDeleteConversation: selectedConversationId ? handleDeleteConversation : undefined,
    deleting: isDeleting,
    conversations,
    activeConversationId: selectedConversationId,
    onSelectConversation: handleSelectConversation,
  };

  const composerFrame = composerMode === "panel"
    ? { left: panelPos.x, top: panelPos.y, width: panelSize.width, height: panelSize.height, radius: 18 }
    : composerMode === "icon"
      ? { left: iconPos.x, top: iconPos.y, width: ICON_SIZE, height: ICON_SIZE, radius: 999 }
      : dockedFrame(viewport.width, viewport.height, dockHeight);

  return (
    <div ref={pageRef} className="relative flex h-full w-full min-w-0 max-w-full flex-col select-text overflow-hidden bg-background">
      <VoiceSession active={voiceOpen} />
      <div className="relative min-h-0 min-w-0 flex-1">
      <div className="custom-scrollbar h-full min-w-0 overflow-x-hidden overflow-y-auto px-0 pb-4 pt-8">
        <div className={CHAT_STAGE}>
          <p className="font-google-sans mb-6 truncate text-[13px] tracking-[-0.224px] text-[#7a7a7a]">
            {conversations.find((conversation) => conversation.id === selectedConversationId)?.title || "Yeni sohbet"}
          </p>
          {visibleMessages.length === 0 && !pendingUserQuery && !liveAnswer && (
            <div className="pb-12 pt-24 text-left">
              <h1 className="font-google-sans mb-3 text-[40px] font-semibold leading-[1.07] tracking-[-0.374px] text-[#1d1d1f] dark:text-[#ffffff] md:text-[48px]">
                Zenlecs+
              </h1>
              <p className="font-google-sans mb-12 max-w-xl text-[20px] font-normal leading-[1.47] tracking-[0.196px] text-[#7a7a7a] md:text-[24px]">
                Hukuki analiz, dosya stratejisi ve agentic iş akışları için yerleşik yapay zeka çalışma alanı.
              </p>

              <div className="flex flex-col gap-3">
                <span className="font-google-sans text-[13px] font-medium tracking-[-0.224px] text-[#7a7a7a]">
                  Hızlı Başlangıç Önerileri
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {[
                    "Dava dilekçesi taslağı ve delil listesi hazırla",
                    "Borçlar Kanunu kapsamında temerrüt ve ihtar analizi",
                    "Ticari sözleşme maddelerindeki hukuki riskleri değerlendir",
                    "Duruşma öncesi tensip zaptı ve tanık beyanı stratejisi",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSendMessage(suggestion)}
                      className={`${WRAP} font-google-sans max-w-full rounded-full border border-black/[0.08] bg-background px-4 py-2 text-left text-[14px] text-[#1d1d1f] transition-all hover:border-[#0066cc] active:scale-95 dark:border-white/[0.12] dark:text-[#f5f5f7] dark:hover:border-[#2997ff]`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {visibleMessages.map((message) => {
            if (message.role === "user") {
              return <UserTurn key={message.id} content={message.content} time={formatMessageTime(message.createdAt)} />;
            }
            return (
              <AssistantTurn key={message.id} time={formatMessageTime(message.createdAt)}>
                <AssistantBeats beats={splitIntoBeats(message.content, true)} animate={false} />
              </AssistantTurn>
            );
          })}

          {pendingUserQuery && <UserTurn content={pendingUserQuery} time="Şimdi" />}

          {liveAnswer && (
            <AssistantTurn streaming={stillRevealing}>
              {visibleBeats.length === 0 ? (
                <WritingDots />
              ) : (
                <AssistantBeats beats={visibleBeats} animate />
              )}
            </AssistantTurn>
          )}

          {errorMessage && !isStreaming && (
            <div className="mb-10 flex w-full min-w-0 justify-start">
              <div className="w-full min-w-0 max-w-[46rem]">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-google-sans select-none text-[13px] font-semibold tracking-[-0.224px] text-red-500">
                    Hata
                  </span>
                </div>
                <p className={`${WRAP} font-google-sans select-text text-[15px] leading-[1.47] tracking-[-0.224px] text-red-500`}>
                  {errorMessage}
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
          <motion.div
            initial={false}
            animate={{ height: composerMode === "docked" ? dockHeight + 8 : 12 }}
            transition={IOS_SPRING}
          />
        </div>
      </div>
      {/* Studio tuvalindeki kenar gölgesinin hafif hali: yalnızca üst ve alt border */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 56px, transparent calc(100% - 56px), hsl(var(--background)) 100%)",
        }}
      />
      </div>

      {viewport.width > 0 && (
        <motion.div
          ref={panelShellRef}
          data-mode={composerMode}
          initial={false}
          animate={{
            left: composerFrame.left,
            top: composerFrame.top,
            width: composerFrame.width,
            height: composerFrame.height,
            borderRadius: composerFrame.radius,
          }}
          transition={composerDragging ? { duration: 0 } : IOS_SPRING}
          onAnimationComplete={() => setComposerClipping(false)}
          className={`absolute z-30 border border-black/[0.08] bg-[#f5f5f7] focus-within:border-[#0066cc]/50 dark:border-white/[0.10] dark:bg-[#272729] dark:focus-within:border-[#2997ff]/50 ${
            composerClipping || composerMode === "icon" ? "overflow-hidden" : "overflow-visible"
          } ${composerMode === "panel" ? "shadow-[0_18px_50px_rgba(0,0,0,0.28)]" : ""} ${
            composerMode === "icon" ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
          }`}
          onPointerDown={composerMode === "icon" ? (event) => beginComposerDrag("icon", event, iconPosRef.current) : undefined}
          onPointerMove={composerMode === "icon" ? moveComposerDrag : undefined}
          onPointerUp={composerMode === "icon" ? endComposerDrag : undefined}
          onPointerCancel={composerMode === "icon" ? endComposerDrag : undefined}
          onDoubleClick={composerMode === "icon" ? expandIcon : undefined}
          role={composerMode === "icon" ? "button" : undefined}
          tabIndex={composerMode === "icon" ? 0 : undefined}
          title={composerMode === "icon" ? "Sürüklemek için tut, açmak için çift tıkla" : undefined}
          aria-label={composerMode === "icon" ? "Yazma kutusu simgesi" : undefined}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={composerMode}
              className={composerMode === "docked" ? "w-full" : "h-full w-full"}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={IOS_SPRING}
            >
              {composerMode === "docked" && (
                <div ref={dockMeasureRef}>
                  <ChatComposer {...composerProps} bare onOpenPanel={openPanel} onMinimize={() => minimizeComposer("docked")} />
                </div>
              )}
              {composerMode === "panel" && (
                <VerticalChatComposer
                  {...composerProps}
                  bare
                  onMinimize={() => minimizeComposer("panel")}
                  onDock={dockComposer}
                  onDragPointerDown={(event) => beginComposerDrag("panel", event, panelPosRef.current)}
                  onDragPointerMove={moveComposerDrag}
                  onDragPointerUp={endComposerDrag}
                />
              )}
              {composerMode === "icon" && (
                <div className="flex h-full w-full items-center justify-center text-[#1d1d1f] dark:text-[#f5f5f7]">
                  <MessageSquare className="h-4 w-4" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
