import { ChevronDown, GripHorizontal, PanelBottom } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import {
  AttachmentRow,
  COMPOSER_SURFACE,
  ComposerActions,
  ComposerControls,
  ComposerTextarea,
  RoundIconButton,
  SF_TEXT,
  useComposerCore,
  type ChatComposerProps,
} from "@/components/chat/composer-shared";

interface VerticalChatComposerProps extends ChatComposerProps {
  onMinimize: () => void;
  onDock: () => void;
  bare?: boolean;
  onDragPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDragPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDragPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

/** 4:3 dikey pencere. İçerik alt şeritle aynı altyapıyı kullanır; serbest sürüklenir. */
export function VerticalChatComposer({
  onMinimize,
  onDock,
  bare = false,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  ...props
}: VerticalChatComposerProps) {
  const core = useComposerCore(props);

  return (
    <form
      ref={core.formRef as React.Ref<HTMLFormElement>}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
      className={cn(
        "flex h-full w-full min-h-0 flex-col overflow-visible",
        bare ? "bg-transparent" : `rounded-[18px] shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${COMPOSER_SURFACE}`,
      )}
    >
      <div
        className="flex h-9 shrink-0 cursor-grab touch-none select-none items-center gap-1 border-b border-black/[0.08] px-2 active:cursor-grabbing dark:border-white/[0.10]"
        title="Taşı"
        aria-label="Pencereyi taşı"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <GripHorizontal className="h-4 w-4 text-[#7a7a7a]" />
        <span className="text-[12px] tracking-[-0.12px] text-[#7a7a7a]" style={{ fontFamily: SF_TEXT }}>
          Yaz
        </span>
        <div className="ml-auto flex items-center">
          <RoundIconButton title="Alta sabitle" onClick={onDock}>
            <PanelBottom className="h-4 w-4" />
          </RoundIconButton>
          <RoundIconButton title="Simge durumuna küçült" onClick={onMinimize}>
            <ChevronDown className="h-4 w-4" />
          </RoundIconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-3 pt-2">
        <ComposerTextarea core={core} className="h-full overflow-y-auto" />
      </div>
      <AttachmentRow core={core} />
      <div className="relative flex shrink-0 items-center justify-end px-1.5 pb-1">
        <ComposerActions core={core} />
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-black/[0.08] px-1.5 py-1.5 dark:border-white/[0.10]">
        <ComposerControls core={core} stacked />
      </div>
    </form>
  );
}
