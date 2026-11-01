import React, { memo } from "react";
import {
  FolderOpen,
  User,
  Building2,
  Gavel,
  Clock,
  FileText,
  Bot,
  Zap,
  Plug,
  Sparkles,
  GitBranch,
  ShieldCheck,
  Share,
  type LucideIcon,
} from "lucide-react";
import { apple, appleFont } from "./tokens";
import {
  NODE_TYPE_LABEL,
  getNodeSummary,
  type NodeType,
  type StudioNode,
} from "./types";

export type { NodeType, StudioNode };

export function getNodeConfig(type: NodeType): {
  icon: LucideIcon;
  label: string;
  dotColor: string;
} {
  switch (type) {
    case "entity":
      return { icon: User, label: NODE_TYPE_LABEL.entity, dotColor: "#ffffff" };
    case "matter":
      return { icon: FolderOpen, label: NODE_TYPE_LABEL.matter, dotColor: apple.primaryOnDark };
    case "dossier":
      return { icon: FileText, label: NODE_TYPE_LABEL.dossier, dotColor: apple.success };
    case "hearing":
      return { icon: Gavel, label: NODE_TYPE_LABEL.hearing, dotColor: apple.warning };
    case "deadline":
      return { icon: Clock, label: NODE_TYPE_LABEL.deadline, dotColor: apple.danger };
    case "agent":
      return { icon: Bot, label: NODE_TYPE_LABEL.agent, dotColor: apple.purple };
    case "trigger":
      return { icon: Zap, label: NODE_TYPE_LABEL.trigger, dotColor: apple.warning };
    case "connector":
      return { icon: Plug, label: NODE_TYPE_LABEL.connector, dotColor: apple.primaryOnDark };
    case "ai_step":
      return { icon: Sparkles, label: NODE_TYPE_LABEL.ai_step, dotColor: apple.purple };
    case "logic":
      return { icon: GitBranch, label: NODE_TYPE_LABEL.logic, dotColor: "#98989d" };
    case "approval":
      return { icon: ShieldCheck, label: NODE_TYPE_LABEL.approval, dotColor: apple.danger };
    case "output":
      return { icon: Share, label: NODE_TYPE_LABEL.output, dotColor: apple.success };
  }
}

export interface RunChip {
  status: "running" | "done" | "error";
  message?: string;
}

export const NODE_W = 248;
export const NODE_H = 96;
export const NODE_CX = 124;
export const NODE_CY = 48;
export const PARTY_SIZE = 192;

export function nodeBox(node: Pick<StudioNode, "type">): { w: number; h: number } {
  if (node.type === "entity") return { w: PARTY_SIZE, h: PARTY_SIZE };
  return { w: NODE_W, h: NODE_H };
}

export function nodeCenter(node: StudioNode, pos?: { x: number; y: number }) {
  const box = nodeBox(node);
  return {
    x: (pos?.x ?? node.x) + box.w / 2,
    y: (pos?.y ?? node.y) + box.h / 2,
  };
}

/** Secondary label on dark — sharper than washed #7a7a7a at small sizes */
const labelSecondary = "#98989d";
const labelTertiary = "#636366";
const FLOW_TYPES = new Set<NodeType>(["trigger", "connector", "ai_step", "logic", "approval", "output", "agent"]);

export function flowPorts(type: NodeType): { in?: string; out?: string } {
  if (!FLOW_TYPES.has(type)) return {};
  if (type === "trigger") return { out: "signal" };
  if (type === "connector") return { in: "signal", out: "docs" };
  if (type === "output") return { in: "docs" };
  if (type === "agent") return { in: "matterRef", out: "text" };
  return { in: "text", out: "text" };
}

interface GraphNodeProps {
  node: StudioNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onDoubleClick?: (e: React.MouseEvent, nodeId: string) => void;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  runChip?: RunChip | null;
  onRetryRun?: (nodeId: string) => void;
  onCancelRun?: (nodeId: string) => void;
  onPortPointerDown?: (event: React.PointerEvent, nodeId: string, side: "in" | "out", port: string) => void;
}

function GraphNodeInner({ node, selected, onPointerDown, onDoubleClick, onContextMenu, runChip, onRetryRun, onCancelRun, onPortPointerDown }: GraphNodeProps) {
  const config = getNodeConfig(node.type);
  const individual = node.type === "entity" && node.data.entity_type === "Individual";
  const corporate = node.type === "entity" && !individual;
  const Icon = individual ? User : corporate ? Building2 : config.icon;
  const summary = getNodeSummary(node);
  const ports = flowPorts(node.type);

  const critical = summary.statusTone === "danger";
  const active = summary.statusTone === "active";
  const statusColor = critical ? apple.danger : active ? apple.primaryOnDark : labelSecondary;
  const shape = individual ? "circle" : corporate ? "square" : "rect";

  return (
    <div
      data-node-id={node.id}
      data-node-shape={shape}
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(e, node.id);
      }}
      onContextMenu={(e) => onContextMenu(e, node.id)}
      className={`absolute pointer-events-auto cursor-grab select-none touch-none active:cursor-grabbing ${
        individual
          ? "flex h-[192px] w-[192px] flex-col items-center justify-center overflow-hidden rounded-full px-8 text-center"
          : corporate
            ? "flex h-[192px] w-[192px] flex-col justify-center overflow-hidden rounded-[18px] px-3.5 py-3"
            : "w-[248px] rounded-[14px] px-3.5 py-3"
      }`}
      style={{
        left: Math.round(node.x),
        top: Math.round(node.y),
        backgroundColor: selected ? "#2c2c2e" : "#1c1c1e",
        border: selected ? `1px solid ${apple.primaryFocus}` : "1px solid rgba(255,255,255,0.1)",
        fontFamily: appleFont,
        // Keep glyphs sharp under canvas scale (avoid paint containment / layer promotion)
        WebkitFontSmoothing: "auto",
        MozOsxFontSmoothing: "auto",
        textRendering: "geometricPrecision",
      }}
    >
      {individual ? (
        <>
          <Icon className="mb-2 h-7 w-7 shrink-0" strokeWidth={2} style={{ color: config.dotColor }} />
          <div
            className="line-clamp-3 text-[15px] font-semibold leading-[1.25]"
            style={{ color: "#f5f5f7", letterSpacing: "-0.015em", fontWeight: 600 }}
          >
            {summary.title}
          </div>
          {summary.meta && (
            <div className="mt-1 line-clamp-2 text-[12px] leading-snug" style={{ color: labelTertiary }}>
              {summary.meta}
            </div>
          )}
          {summary.status && (
            <div className="mt-1.5 text-[11px] font-medium" style={{ color: statusColor }}>
              {summary.status}
            </div>
          )}
        </>
      ) : (
      <>
      {/* Type + status */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon
            className="w-3.5 h-3.5 shrink-0"
            strokeWidth={2.25}
            style={{ color: config.dotColor }}
          />
          <span
            className="text-[12px] font-medium truncate"
            style={{ color: labelSecondary, letterSpacing: "-0.01em" }}
          >
            {config.label}
          </span>
        </div>
        {summary.status && (
          <span
            className="text-[11px] font-medium shrink-0 truncate max-w-[118px] tabular-nums"
            style={{ color: statusColor, letterSpacing: "-0.01em" }}
            title={summary.status}
          >
            {summary.status}
          </span>
        )}
      </div>

      {/* Title */}
      <div
        className="text-[15px] font-semibold leading-[1.25] line-clamp-2"
        style={{ color: "#f5f5f7", letterSpacing: "-0.015em", fontWeight: 600 }}
      >
        {summary.title}
      </div>

      {/* Type-specific meta */}
      {summary.meta && (
        <div
          className="mt-1 text-[12px] font-normal leading-snug line-clamp-1"
          style={{ color: labelTertiary, letterSpacing: "-0.01em" }}
        >
          {summary.meta}
        </div>
      )}

      {/* Master-model metric (claim amount, due date, exhibit, …) */}
      {runChip && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: labelSecondary }}>
          {runChip.status === "running" && (
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30 border-t-white animate-spin" />
          )}
          <span className="min-w-0 truncate" style={{ color: runChip.status === "error" ? apple.danger : runChip.status === "done" ? apple.success : labelSecondary }}>
            {runChip.message || (runChip.status === "running" ? "Çalışıyor" : runChip.status === "done" ? "Tamam" : "Hata")}
          </span>
          {runChip.status === "running" && onCancelRun && (
            <button
              type="button"
              className="shrink-0 underline"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onCancelRun(node.id);
              }}
            >
              Durdur
            </button>
          )}
          {runChip.status === "error" && onRetryRun && (
            <button
              type="button"
              className="shrink-0 underline"
              style={{ color: apple.danger }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRetryRun(node.id);
              }}
            >
              Yeniden dene
            </button>
          )}
        </div>
      )}

      {summary.metric && (
        <div
          className="mt-2.5 pt-2 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span className="text-[12px] font-medium shrink-0" style={{ color: labelTertiary }}>
            {summary.metric.label}
          </span>
          <span
            className="text-[12px] font-semibold truncate tabular-nums"
            style={{
              color:
                summary.metric.tone === "danger"
                  ? apple.danger
                  : summary.metric.tone === "success"
                    ? apple.success
                    : "rgba(255,255,255,0.9)",
              letterSpacing: "-0.01em",
            }}
            title={summary.metric.value}
          >
            {summary.metric.value}
          </span>
        </div>
      )}
      </>
      )}
      {ports.in && (
        <button
          type="button"
          data-port="in"
          data-port-node={node.id}
          data-port-name={ports.in}
          aria-label={ports.in}
          className="absolute left-[-7px] top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/40 bg-[#0a84ff]"
          onPointerDown={(event) => {
            event.stopPropagation();
            onPortPointerDown?.(event, node.id, "in", ports.in!);
          }}
        />
      )}
      {ports.out && (
        <button
          type="button"
          data-port="out"
          data-port-node={node.id}
          data-port-name={ports.out}
          aria-label={ports.out}
          className="absolute right-[-7px] top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/40 bg-[#0a84ff]"
          onPointerDown={(event) => {
            event.stopPropagation();
            onPortPointerDown?.(event, node.id, "out", ports.out!);
          }}
        />
      )}
    </div>
  );
}

export const GraphNode = memo(GraphNodeInner, (a, b) => {
  return (
    a.selected === b.selected &&
    a.node.id === b.node.id &&
    a.node.x === b.node.x &&
    a.node.y === b.node.y &&
    a.node.title === b.node.title &&
    a.node.subtitle === b.node.subtitle &&
    a.node.status === b.node.status &&
    a.node.jurisdiction === b.node.jurisdiction &&
    a.node.type === b.node.type &&
    a.node.data === b.node.data &&
    a.runChip?.status === b.runChip?.status &&
    a.runChip?.message === b.runChip?.message &&
    a.onPortPointerDown === b.onPortPointerDown
  );
});
