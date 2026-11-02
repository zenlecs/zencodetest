import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Check, ChevronsUpDown, History, Layers, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * Alt şerit ve 4:3 pencere aynı seçim, menü ve gönderim altyapısını kullanır.
 * Yüzey: hairline çerçeve, gölgesiz; ışıkta #f5f5f7, karanlıkta #272729.
 */

export const SF_TEXT = "SF Pro Text, system-ui, -apple-system, sans-serif";

export const COMPOSER_SURFACE = cn(
  "border border-black/[0.08] bg-[#f5f5f7] dark:border-white/[0.10] dark:bg-[#272729]",
  "transition-colors duration-200",
  "focus-within:border-[#0066cc]/50 dark:focus-within:border-[#2997ff]/50",
);

export const DEFAULT_MODEL = "openai/gpt-oss-120b";

export interface ComposerAttachment {
  name: string;
  size: number;
}

export interface ComposerSelection {
  model: string;
  styleId: string;
  skillIds: string[];
  attachments: ComposerAttachment[];
}

export const DEFAULT_SELECTION: ComposerSelection = {
  model: DEFAULT_MODEL,
  styleId: "denge",
  skillIds: [],
  attachments: [],
};

interface ModelOption {
  id: string;
  name: string;
  description?: string;
  status?: string;
}

const INTELLIGENCE_STYLES = [
  { id: "hizli", label: "Hızlı yanıt", hint: "Akışkan ve kısa" },
  { id: "denge", label: "Dengeli", hint: "Varsayılan denge" },
  { id: "derin", label: "Derin analiz", hint: "Uzun, gerekçeli inceleme" },
  { id: "yaratici", label: "Yaratıcı", hint: "Farklı bakış açıları" },
];

const AGENTIC_SKILLS = [
  { id: "dosya-analizi", label: "Dosya Analizi" },
  { id: "sure-hesabi", label: "Süre & Takvim Hesabı" },
  { id: "delil-degerlendirme", label: "Delil Değerlendirme" },
  { id: "sozlesme-karsilastirma", label: "Sözleşme Karşılaştırma" },
  { id: "web-arastirma", label: "Web Araştırması" },
  { id: "dilekce-taslagi", label: "Dilekçe Taslağı" },
];

const FALLBACK_MODELS: ModelOption[] = [
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", description: "Dengeli akıl yürütme modeli · iki promptta bir" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", description: "Yüksek kapasiteli hukuk modeli · iki promptta bir" },
];

type MenuId = "model" | "style" | "skills" | "history" | null;

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ChatConversationOption {
  id: number;
  title: string;
  updatedAt: string;
}

export interface ChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  selection: ComposerSelection;
  onSelectionChange: (selection: ComposerSelection) => void;
  onSubmit: () => void;
  disabled?: boolean;
  inputRef?: { current: HTMLTextAreaElement | null };
  onNewChat: () => void;
  onDeleteConversation?: () => void;
  deleting?: boolean;
  conversations?: ChatConversationOption[];
  activeConversationId?: number | null;
  onSelectConversation?: (id: number) => void;
  onToggleVoice?: () => void;
  voiceActive?: boolean;
}

export function RoundIconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-[#7a7a7a] transition-all hover:bg-black/[0.05] hover:text-[#0066cc] active:scale-[0.95] disabled:opacity-40 dark:hover:bg-white/[0.06] dark:hover:text-[#2997ff]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function TextControl({
  active,
  onClick,
  title,
  children,
  disabled,
  fullWidth,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ fontFamily: SF_TEXT }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[14px] leading-[1.29] tracking-[-0.224px]",
        "transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
        fullWidth && "w-full justify-start",
        active
          ? "text-[#0066cc] dark:text-[#2997ff]"
          : "text-[#333333] hover:text-[#1d1d1f] dark:text-[#cccccc] dark:hover:text-[#f5f5f7]",
      )}
    >
      {children}
    </button>
  );
}

function Menu({ children, dropDown }: { children: React.ReactNode; dropDown?: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-0 z-40 max-h-72 min-w-[220px] max-w-[340px] overflow-x-hidden overflow-y-auto rounded-[18px] border border-black/[0.08] bg-white py-1.5 dark:border-white/[0.10] dark:bg-[#2a2a2c]",
        dropDown ? "top-full mt-2" : "bottom-full mb-2",
      )}
      style={{ fontFamily: SF_TEXT }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
    >
      <span className="flex-1">{children}</span>
      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0066cc] dark:text-[#2997ff]" />}
    </button>
  );
}

export interface ComposerCore {
  formRef: React.RefObject<HTMLFormElement | null>;
  value: string;
  disabled?: boolean;
  selection: ComposerSelection;
  conversations: ChatConversationOption[];
  activeConversationId: number | null;
  deleting: boolean;
  openMenu: MenuId;
  menuDropsDown: boolean;
  confirmingDelete: boolean;
  models: ModelOption[];
  activeModel?: ModelOption;
  activeStyle?: (typeof INTELLIGENCE_STYLES)[number];
  canDelete: boolean;
  bindTextarea: (element: HTMLTextAreaElement | null) => void;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onTextKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  toggleMenu: (id: Exclude<MenuId, null>) => void;
  menuProps: (id: Exclude<MenuId, null>) => { active: boolean; onClick: () => void };
  chooseModel: (id: string) => void;
  chooseStyle: (id: string) => void;
  toggleSkill: (id: string) => void;
  removeAttachment: (name: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  openFilePicker: () => void;
  openHistory: () => void;
  startNewChat: () => void;
  askDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  selectConversation: (id: number) => void;
}

export function useComposerCore(props: ChatComposerProps & { growTextarea?: boolean }): ComposerCore {
  const {
    value,
    onValueChange,
    selection,
    onSelectionChange,
    onSubmit,
    disabled,
    inputRef,
    onNewChat,
    onDeleteConversation,
    deleting = false,
    conversations = [],
    activeConversationId = null,
    onSelectConversation,
    growTextarea = false,
  } = props;

  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [menuDropsDown, setMenuDropsDown] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const localInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: fetchedModels } = useQuery<ModelOption[]>({
    queryKey: ["/api/ai/models"],
    queryFn: async () => {
      const res = await fetch("/api/ai/models");
      if (!res.ok) throw new Error("Modeller alınamadı");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const models = fetchedModels && fetchedModels.length > 0 ? fetchedModels : FALLBACK_MODELS;
  const activeModel = models.find((model) => model.id === selection.model) ?? models[0];
  const activeStyle = INTELLIGENCE_STYLES.find((style) => style.id === selection.styleId);

  const textareaWidthRef = useRef(0);

  useLayoutEffect(() => {
    if (!growTextarea) return;
    const el = localInputRef.current;
    if (!el) return;

    const fit = () => {
      const width = el.clientWidth;
      // Simgeye inip çıkarken kutu bir an dar; o genişlikte satır kırılımı yüksekliği şişirmesin.
      if (width < 120) return;
      const computed = window.getComputedStyle(el);
      const parsedLine = parseFloat(computed.lineHeight);
      const fontSize = parseFloat(computed.fontSize);
      const line = Number.isFinite(parsedLine) ? parsedLine : Number.isFinite(fontSize) ? fontSize * 1.47 : 25;
      const maxHeight = Math.ceil(line * 3);
      el.style.height = "auto";
      const full = el.scrollHeight;
      el.style.height = `${Math.min(full, maxHeight)}px`;
      el.style.overflowY = full > maxHeight + 1 ? "auto" : "hidden";
      textareaWidthRef.current = width;
    };

    fit();
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === textareaWidthRef.current) return;
      fit();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.style.height = "";
      el.style.overflowY = "";
    };
  }, [value, growTextarea]);

  useEffect(() => {
    if (!openMenu && !confirmingDelete) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
        setConfirmingDelete(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setConfirmingDelete(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu, confirmingDelete]);

  const setSelection = (patch: Partial<ComposerSelection>) =>
    onSelectionChange({ ...selection, ...patch });

  const placeMenu = () => {
    const rect = formRef.current?.getBoundingClientRect();
    setMenuDropsDown(rect ? rect.top < 260 : false);
  };

  const toggleMenu = (id: Exclude<MenuId, null>) => {
    if (openMenu === id) {
      setOpenMenu(null);
      return;
    }
    placeMenu();
    setOpenMenu(id);
  };

  return {
    formRef,
    value,
    disabled,
    selection,
    conversations,
    activeConversationId,
    deleting,
    openMenu,
    menuDropsDown,
    confirmingDelete,
    models,
    activeModel,
    activeStyle,
    canDelete: !!onDeleteConversation,
    bindTextarea: (element) => {
      localInputRef.current = element;
      if (inputRef) inputRef.current = element;
    },
    onTextChange: (event) => onValueChange(event.target.value),
    onTextKeyDown: (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit();
      }
      if (event.key === "Escape") setOpenMenu(null);
    },
    toggleMenu,
    menuProps: (id) => ({ active: openMenu === id, onClick: () => toggleMenu(id) }),
    chooseModel: (id) => {
      setSelection({ model: id });
      setOpenMenu(null);
    },
    chooseStyle: (id) => {
      setSelection({ styleId: id });
      setOpenMenu(null);
    },
    toggleSkill: (id) =>
      setSelection({
        skillIds: selection.skillIds.includes(id)
          ? selection.skillIds.filter((skillId) => skillId !== id)
          : [...selection.skillIds, id],
      }),
    removeAttachment: (name) =>
      setSelection({ attachments: selection.attachments.filter((file) => file.name !== name) }),
    onFileChange: (event) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      setSelection({
        attachments: [
          ...selection.attachments,
          ...files
            .filter((file) => !selection.attachments.some((attachment) => attachment.name === file.name))
            .map((file) => ({ name: file.name, size: file.size })),
        ],
      });
      event.target.value = "";
    },
    fileInputRef,
    openFilePicker: () => fileInputRef.current?.click(),
    openHistory: () => {
      setConfirmingDelete(false);
      toggleMenu("history");
    },
    startNewChat: () => {
      setOpenMenu(null);
      setConfirmingDelete(false);
      onNewChat();
    },
    askDelete: () => {
      setOpenMenu(null);
      setConfirmingDelete((current) => {
        const next = !current;
        if (next) placeMenu();
        return next;
      });
    },
    cancelDelete: () => setConfirmingDelete(false),
    confirmDelete: () => {
      setConfirmingDelete(false);
      onDeleteConversation?.();
    },
    selectConversation: (id) => {
      setOpenMenu(null);
      onSelectConversation?.(id);
    },
  };
}

const fieldClass =
  "w-full min-w-0 resize-none break-words border-0 bg-transparent text-[17px] leading-[1.47] tracking-[-0.374px] text-[#1d1d1f] outline-none placeholder:text-[#7a7a7a]/70 [overflow-wrap:anywhere] dark:text-[#f5f5f7]";

export function ComposerTextarea({ core, className }: { core: ComposerCore; className?: string }) {
  return (
    <textarea
      ref={core.bindTextarea}
      value={core.value}
      onChange={core.onTextChange}
      onKeyDown={core.onTextKeyDown}
      placeholder="Zenlecs+ ile sohbet edin veya bir görev verin..."
      disabled={core.disabled}
      rows={2}
      style={{ fontFamily: SF_TEXT }}
      className={cn(fieldClass, className)}
    />
  );
}

export function AttachmentRow({ core }: { core: ComposerCore }) {
  if (core.selection.attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {core.selection.attachments.map((file) => (
        <span
          key={file.name}
          style={{ fontFamily: SF_TEXT }}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white py-1 pl-3 pr-1.5 text-[14px] tracking-[-0.224px] text-[#333333] dark:border-white/[0.10] dark:bg-[#2a2a2c] dark:text-[#cccccc]"
        >
          <Paperclip className="h-3.5 w-3.5 text-[#7a7a7a]" />
          <span className="max-w-[140px] truncate">{file.name}</span>
          <button
            type="button"
            title="Eki kaldır"
            onClick={() => core.removeAttachment(file.name)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[#7a7a7a] transition-colors hover:text-red-500 active:scale-95"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function ComposerActions({ core }: { core: ComposerCore }) {
  return (
    <>
      <RoundIconButton title="Sohbetler" onClick={core.openHistory}>
        <History className="h-4 w-4" />
      </RoundIconButton>
      {core.openMenu === "history" && (
        <div
          className={cn(
            "absolute right-0 z-40 max-h-72 w-72 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-[18px] border border-black/[0.08] bg-white py-1.5 dark:border-white/[0.10] dark:bg-[#2a2a2c]",
            core.menuDropsDown ? "top-full mt-2" : "bottom-full mb-2",
          )}
          style={{ fontFamily: SF_TEXT }}
        >
          {core.conversations.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-[#7a7a7a]">Kayıtlı sohbet yok</p>
          ) : (
            core.conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => core.selectConversation(conversation.id)}
                className="flex w-full items-start gap-2 px-4 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] tracking-[-0.224px] text-[#1d1d1f] dark:text-[#ffffff]">
                    {conversation.title || "Yeni sohbet"}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[#7a7a7a]">
                    {formatConversationTime(conversation.updatedAt)}
                  </span>
                </span>
                {conversation.id === core.activeConversationId && (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0066cc] dark:text-[#2997ff]" />
                )}
              </button>
            ))
          )}
        </div>
      )}
      <RoundIconButton title="Yeni Sohbet Başlat" onClick={core.startNewChat}>
        <Plus className="h-4 w-4" />
      </RoundIconButton>
      {core.canDelete && (
        <RoundIconButton
          title="Sohbeti Sil"
          onClick={core.askDelete}
          disabled={core.deleting}
          className="hover:text-red-500 dark:hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </RoundIconButton>
      )}
      {core.confirmingDelete && core.canDelete && (
        <div
          className={cn(
            "absolute right-0 z-40 w-64 rounded-[18px] border border-black/[0.08] bg-white p-3 dark:border-white/[0.10] dark:bg-[#2a2a2c]",
            core.menuDropsDown ? "top-full mt-2" : "bottom-full mb-2",
          )}
          style={{ fontFamily: SF_TEXT }}
        >
          <p className="text-[13px] leading-[1.4] text-[#1d1d1f] dark:text-[#f5f5f7]">
            Bu sohbet ve mesajları silinsin mi?
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={core.cancelDelete}
              className="rounded-full px-3 py-1 text-[13px] text-[#7a7a7a] transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={core.deleting}
              onClick={core.confirmDelete}
              className="rounded-full bg-red-500 px-3 py-1 text-[13px] text-white transition-colors hover:bg-red-600 disabled:opacity-40"
            >
              Sil
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ComposerControls({ core, stacked = false }: { core: ComposerCore; stacked?: boolean }) {
  return (
    <>
      <input
        ref={core.fileInputRef as React.Ref<HTMLInputElement>}
        type="file"
        multiple
        className="hidden"
        onChange={core.onFileChange}
        aria-label="Dosya seç"
      />
      <div className="relative">
        <TextControl title="Model seçimi" fullWidth={stacked} {...core.menuProps("model")}>
          <span className={cn("truncate", stacked ? "max-w-full" : "max-w-[210px]")}>{core.activeModel?.name ?? "Model"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </TextControl>
        {core.openMenu === "model" && (
          <Menu dropDown={core.menuDropsDown}>
            {core.models.map((model) => (
              <MenuItem key={model.id} selected={model.id === core.selection.model} onClick={() => core.chooseModel(model.id)}>
                <span className="block text-[14px] font-semibold tracking-[-0.224px] text-[#1d1d1f] dark:text-[#ffffff]" style={{ fontFamily: SF_TEXT }}>
                  {model.name}
                </span>
                {model.description && (
                  <span className="mt-0.5 block text-[12px] leading-[1.3] tracking-[-0.12px] text-[#7a7a7a]">{model.description}</span>
                )}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
      <div className="relative">
        <TextControl title="Zeka stili" fullWidth={stacked} {...core.menuProps("style")}>
          <Brain className="h-3.5 w-3.5 text-[#7a7a7a]" />
          <span>{core.activeStyle?.label ?? "Stil"}</span>
        </TextControl>
        {core.openMenu === "style" && (
          <Menu dropDown={core.menuDropsDown}>
            {INTELLIGENCE_STYLES.map((style) => (
              <MenuItem key={style.id} selected={style.id === core.selection.styleId} onClick={() => core.chooseStyle(style.id)}>
                <span className="block text-[14px] tracking-[-0.224px] text-[#1d1d1f] dark:text-[#ffffff]" style={{ fontFamily: SF_TEXT }}>
                  {style.label}
                </span>
                <span className="mt-0.5 block text-[12px] leading-[1.3] tracking-[-0.12px] text-[#7a7a7a]">{style.hint}</span>
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
      <TextControl
        title="Dosya seç"
        fullWidth={stacked}
        active={core.selection.attachments.length > 0}
        disabled={core.disabled}
        onClick={core.openFilePicker}
      >
        <Paperclip className="h-3.5 w-3.5 text-[#7a7a7a]" />
        <span>Dosya{core.selection.attachments.length > 0 ? ` · ${core.selection.attachments.length}` : ""}</span>
      </TextControl>
      <div className="relative">
        <TextControl
          title="Agentic skill seçimi"
          fullWidth={stacked}
          active={core.selection.skillIds.length > 0 || core.openMenu === "skills"}
          onClick={() => core.toggleMenu("skills")}
        >
          <Layers className="h-3.5 w-3.5 text-[#7a7a7a]" />
          <span>Skill{core.selection.skillIds.length > 0 ? ` · ${core.selection.skillIds.length}` : ""}</span>
        </TextControl>
        {core.openMenu === "skills" && (
          <Menu dropDown={core.menuDropsDown}>
            {AGENTIC_SKILLS.map((skill) => (
              <MenuItem key={skill.id} selected={core.selection.skillIds.includes(skill.id)} onClick={() => core.toggleSkill(skill.id)}>
                <span className="block text-[14px] tracking-[-0.224px] text-[#1d1d1f] dark:text-[#ffffff]" style={{ fontFamily: SF_TEXT }}>
                  {skill.label}
                </span>
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
      <div className={cn("flex items-center", stacked ? "justify-end pt-1" : "ml-auto")}>
        <button
          type="submit"
          disabled={!core.value.trim() || core.disabled}
          title="Gönder"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
            core.value.trim() && !core.disabled
              ? "bg-[#0066cc] text-white hover:bg-[#0071e3] active:scale-[0.95]"
              : "cursor-not-allowed bg-black/[0.06] text-[#7a7a7a] dark:bg-white/[0.10]",
          )}
        >
          <ArrowUp className="h-4 w-4 stroke-[2.5]" />
        </button>
      </div>
    </>
  );
}
