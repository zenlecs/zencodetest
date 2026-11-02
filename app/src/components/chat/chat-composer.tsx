import { ChevronDown, Mic, RectangleVertical } from "lucide-react";
import React from "react";
import {
  AttachmentRow,
  COMPOSER_SURFACE,
  ComposerActions,
  ComposerControls,
  ComposerTextarea,
  RoundIconButton,
  useComposerCore,
  type ChatComposerProps,
} from "@/components/chat/composer-shared";

export {
  DEFAULT_MODEL,
  DEFAULT_SELECTION,
  type ChatComposerProps,
  type ChatConversationOption,
  type ComposerAttachment,
  type ComposerSelection,
} from "@/components/chat/composer-shared";

interface DockedChatComposerProps extends ChatComposerProps {
  onOpenPanel?: () => void;
  onMinimize?: () => void;
  bare?: boolean;
}

/** Sayfanın altındaki geniş yatay yazma kutusu. */
export function ChatComposer({ onOpenPanel, onMinimize, bare = false, ...props }: DockedChatComposerProps) {
  const core = useComposerCore({ ...props, growTextarea: true });

  return (
    <form
      ref={core.formRef as React.Ref<HTMLFormElement>}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
      className={`relative w-full min-w-0 max-w-full overflow-visible ${bare ? "bg-transparent" : `rounded-[18px] ${COMPOSER_SURFACE}`}`}
    >
      <AttachmentRow core={core} />
      <div className="flex min-w-0 items-start gap-2 px-4 pb-2.5 pt-3">
        <ComposerTextarea core={core} className="min-h-[44px] flex-1" />
        <div className="relative -mr-1 flex shrink-0 items-center gap-0.5 pt-0.5">
          {onOpenPanel && (
            <RoundIconButton title="Dikey pencere" onClick={onOpenPanel}>
              <RectangleVertical className="h-4 w-4" />
            </RoundIconButton>
          )}
          {onMinimize && (
            <RoundIconButton title="Simge durumuna küçült" onClick={onMinimize}>
              <ChevronDown className="h-4 w-4" />
            </RoundIconButton>
          )}
          {props.onToggleVoice && (
            <RoundIconButton
              title={props.voiceActive ? "Sesli konuşmayı kapat" : "Sesli konuş"}
              onClick={props.onToggleVoice}
            >
              <Mic className={`h-4 w-4 ${props.voiceActive ? "text-[#0066cc] dark:text-[#2997ff]" : ""}`} />
            </RoundIconButton>
          )}
          <ComposerActions core={core} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-black/[0.08] px-2 py-2 dark:border-white/[0.10]">
        <ComposerControls core={core} />
      </div>
    </form>
  );
}
