import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { apple } from "@/components/studio/tokens";

const IOS_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.75 };

export type GlassSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GlassSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

type PanelPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

/**
 * Select control that mirrors the canvas context-menu material:
 * dark translucent glass panel, hairline border, blue hover state.
 * The list renders in a portal so it is never clipped by the inspector shell.
 */
export function GlassSelect({
  value,
  onChange,
  options,
  placeholder = "Seçin…",
  ariaLabel,
  className,
  disabled,
}: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openUp = spaceBelow < 190 && spaceAbove > spaceBelow;
    const width = Math.min(Math.max(rect.width, 200), window.innerWidth - margin * 2);

    setPosition({
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
      width,
      maxHeight: Math.max(120, Math.min(280, openUp ? spaceAbove : spaceBelow)),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(options.length - 1, index + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = options[active];
        if (option) {
          onChange(option.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, options, active, onChange]);

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      const index = options.findIndex((option) => option.value === value);
      setActive(index >= 0 ? index : 0);
    }
    setOpen((current) => !current);
  };

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        whileTap={{ scale: 0.96 }}
        transition={IOS_SPRING}
        className={cn(
          "liquid-input flex items-center gap-2 text-left select-none disabled:opacity-40",
          className,
        )}
      >
        <span
          className={cn("min-w-0 flex-1 truncate", !selected && "font-normal")}
          style={!selected ? { color: "rgba(235, 235, 245, 0.45)" } : undefined}
        >
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          className="inline-flex shrink-0"
          animate={{ rotate: open ? 180 : 0 }}
          transition={IOS_SPRING}
        >
          <ChevronDown className="h-3.5 w-3.5" style={{ color: "rgba(235, 235, 245, 0.52)" }} />
        </motion.span>
      </motion.button>

      {createPortal(
        <AnimatePresence>
          {open && position && (
          <motion.div
            ref={panelRef}
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: position.bottom != null ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position.bottom != null ? 6 : -6, scale: 0.98 }}
            transition={IOS_SPRING}
            className="fixed z-[60] overflow-y-auto rounded-[14px] p-1.5"
            style={{
              transformOrigin: position.bottom != null ? "bottom left" : "top left",
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: position.width,
              maxHeight: position.maxHeight,
              backgroundColor: "rgba(29, 29, 31, 0.94)",
              backdropFilter: "saturate(180%) blur(20px)",
              WebkitBackdropFilter: "saturate(180%) blur(20px)",
              border: `1px solid ${apple.hairline}`,
              boxShadow: "0 18px 48px -12px rgba(0, 0, 0, 0.82), 0 2px 8px rgba(0, 0, 0, 0.4)",
              pointerEvents: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255, 255, 255, 0.18) transparent",
            }}
          >
            <div className="flex flex-col gap-0.5">
              {options.map((option, index) => {
                const isActive = index === active;
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? apple.primary
                        : isSelected
                          ? "rgba(255, 255, 255, 0.06)"
                          : "transparent",
                      color: isActive ? "#ffffff" : "rgba(245, 245, 247, 0.86)",
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint && (
                      <span
                        className="shrink-0 text-[11px]"
                        style={{
                          color: isActive ? "rgba(255, 255, 255, 0.68)" : "rgba(235, 235, 245, 0.4)",
                        }}
                      >
                        {option.hint}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.62)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
