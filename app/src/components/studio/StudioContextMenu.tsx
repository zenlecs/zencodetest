import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { apple, appleFont } from "./tokens";
import type { MenuItem } from "./contextMenuModel";

interface StudioContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  onRun: (id: string) => void;
}

function visibleRows(items: MenuItem[]) {
  return items.filter((item): item is Exclude<MenuItem, { type: "separator" }> => item.type !== "separator");
}

function MenuPanel({
  items,
  depth,
  path,
  setPath,
  activeIndex,
  setActiveIndex,
  flip,
  onRun,
  onClose,
}: {
  items: MenuItem[];
  depth: number;
  path: string[];
  setPath: (path: string[]) => void;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  flip: boolean;
  onRun: (id: string) => void;
  onClose: () => void;
}) {
  const rows = visibleRows(items);
  const focused = path.length === depth;
  return (
    <div
      role="menu"
      className="w-[250px] rounded-[14px] p-1.5 pointer-events-auto"
      style={{
        backgroundColor: "rgba(29,29,31,0.94)",
        backdropFilter: "saturate(180%) blur(20px)",
        border: `1px solid ${apple.hairline}`,
        fontFamily: appleFont,
      }}
    >
      {items.map((item) => {
        if (item.type === "separator") {
          return <div key={item.id} className="h-px my-1" style={{ backgroundColor: apple.hairline }} />;
        }
        const rowIndex = rows.indexOf(item);
        const hot = focused && rowIndex === activeIndex;
        const open = item.type === "group" && path[depth] === item.id;
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => {
              setActiveIndex(rowIndex);
              if (item.type === "group") setPath([...path.slice(0, depth), item.id]);
              else setPath(path.slice(0, depth));
            }}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.type === "action" && item.disabled}
              onClick={() => {
                if (item.type === "group") {
                  setPath([...path.slice(0, depth), item.id]);
                  return;
                }
                if (item.disabled) return;
                onRun(item.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[14px] font-normal disabled:opacity-40"
              style={{
                color: item.type === "action" && item.danger ? apple.danger : apple.parchment,
                backgroundColor: hot || open ? apple.primary : "transparent",
              }}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5" />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.type === "action" && item.hint && (
                <span className="text-[11px] opacity-70">{item.hint}</span>
              )}
              {item.type === "group" && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            </button>
            {item.type === "group" && open && (
              <div className={`absolute top-0 z-10 ${flip ? "right-full mr-1" : "left-full ml-1"}`}>
                <MenuPanel
                  items={item.children}
                  depth={depth + 1}
                  path={path}
                  setPath={setPath}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  flip={flip}
                  onRun={onRun}
                  onClose={onClose}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StudioContextMenu({ x, y, items, onClose, onRun }: StudioContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const flip = x > window.innerWidth - 520;

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      const currentItems = path.length === 0 ? items : findGroup(items, path)?.children || items;
      const currentRows = visibleRows(currentItems);
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!currentRows.length) return;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => (index + delta + currentRows.length) % currentRows.length);
        return;
      }
      if (event.key === "ArrowRight") {
        const item = currentRows[activeIndex];
        if (item?.type === "group") {
          event.preventDefault();
          setPath([...path, item.id]);
          setActiveIndex(0);
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        if (path.length) {
          event.preventDefault();
          setPath(path.slice(0, -1));
          setActiveIndex(0);
        }
        return;
      }
      if (event.key === "Enter") {
        const item = currentRows[activeIndex];
        if (!item) return;
        event.preventDefault();
        if (item.type === "group") {
          setPath([...path, item.id]);
          setActiveIndex(0);
          return;
        }
        if (!item.disabled) {
          onRun(item.id);
          onClose();
        }
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [activeIndex, items, onClose, onRun, path]);

  return (
    <div ref={rootRef} className="fixed z-[80]" style={{ left: x, top: y }}>
      <MenuPanel
        items={items}
        depth={0}
        path={path}
        setPath={setPath}
        activeIndex={activeIndex}
        setActiveIndex={setActiveIndex}
        flip={flip}
        onRun={onRun}
        onClose={onClose}
      />
    </div>
  );
}

function findGroup(items: MenuItem[], path: string[]): Extract<MenuItem, { type: "group" }> | null {
  let current = items;
  let found: Extract<MenuItem, { type: "group" }> | null = null;
  for (const id of path) {
    const next = current.find((item) => item.type === "group" && item.id === id);
    if (!next || next.type !== "group") return found;
    found = next;
    current = next.children;
  }
  return found;
}
