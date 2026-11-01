import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { GraphNode, nodeCenter, type RunChip, type StudioNode } from "./GraphNode";
import { StudioMark } from "./StudioMark";
import { apple } from "./tokens";

export interface StudioEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  kind?: "relation" | "flow";
  sourcePort?: string;
  targetPort?: string;
}

interface GraphCanvasProps {
  nodes: StudioNode[];
  edges: StudioEdge[];
  selectedNodeId: string | null;
  pan: { x: number; y: number };
  zoom: number;
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onSelectNode: (id: string | null) => void;
  onNodeDoubleClick?: (id: string) => void;
  onNodePositionCommit: (id: string, x: number, y: number) => void;
  onContextMenu: (e: React.MouseEvent, targetNodeId?: string) => void;
  onSurfacePointerDown?: () => void;
  runChips?: Record<string, RunChip>;
  onRetryRun?: (nodeId: string) => void;
  onCancelRun?: (nodeId: string) => void;
  allSelected?: boolean;
  onConnectFlow?: (sourceId: string, targetId: string, sourcePort: string, targetPort: string) => void;
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const cx = x1 + dx * 0.5;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  pan,
  zoom,
  onPanChange,
  onZoomChange,
  onSelectNode,
  onNodeDoubleClick,
  onNodePositionCommit,
  onContextMenu,
  onSurfacePointerDown,
  runChips,
  onRetryRun,
  onCancelRun,
  allSelected,
  onConnectFlow,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const edgesSvgRef = useRef<SVGSVGElement>(null);

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const nodesRef = useRef(nodes);

  // Live positions during drag (avoids React re-render storm)
  const livePosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isPanningRef = useRef(false);
  const panOriginRef = useRef({ x: 0, y: 0 });
  const draggingIdRef = useRef<string | null>(null);
  const dragOriginRef = useRef({ pointerX: 0, pointerY: 0, nodeX: 0, nodeY: 0 });
  const rafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastNodeClickRef = useRef<{ id: string; time: number; x: number; y: number } | null>(null);
  const portLinkRef = useRef<{ sourceId: string; port: string } | null>(null);
  const connectFlowRef = useRef(onConnectFlow);
  connectFlowRef.current = onConnectFlow;

  useEffect(() => {
    const finish = (event: PointerEvent) => {
      const from = portLinkRef.current;
      portLinkRef.current = null;
      if (!from) return;
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-port]");
      if (!(hit instanceof HTMLElement)) return;
      const targetId = hit.dataset.portNode || "";
      if (hit.dataset.port !== "in" || !targetId || targetId === from.sourceId) return;
      connectFlowRef.current?.(from.sourceId, targetId, from.port, hit.dataset.portName || "text");
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, []);

  useEffect(() => {
    panRef.current = pan;
    zoomRef.current = zoom;
    if (!isPanningRef.current && !draggingIdRef.current && worldRef.current) {
      // Round pan to device pixels — fractional translate+scale softens text
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round(pan.x * dpr) / dpr;
      const y = Math.round(pan.y * dpr) / dpr;
      const z = Math.round(zoom * 1000) / 1000;
      worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    }
  }, [pan, zoom]);

  useEffect(() => {
    nodesRef.current = nodes;
    // Sync live map when React nodes change (and not mid-drag)
    if (!draggingIdRef.current) {
      const map = new Map<string, { x: number; y: number }>();
      for (const n of nodes) map.set(n.id, { x: n.x, y: n.y });
      livePosRef.current = map;
    }
  }, [nodes]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const applyWorldTransform = useCallback((x: number, y: number, z: number) => {
    if (!worldRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const rx = Math.round(x * dpr) / dpr;
    const ry = Math.round(y * dpr) / dpr;
    const rz = Math.round(z * 1000) / 1000;
    // 2D translate (not translate3d) — avoids GPU bitmap scale blur on text
    worldRef.current.style.transform = `translate(${rx}px, ${ry}px) scale(${rz})`;
  }, []);

  const redrawEdges = useCallback(() => {
    const svg = edgesSvgRef.current;
    if (!svg) return;
    const paths = svg.querySelectorAll<SVGPathElement>("[data-edge-path]");
    const labels = svg.querySelectorAll<SVGGElement>("[data-edge-label]");

    paths.forEach((pathEl) => {
      const src = pathEl.dataset.src!;
      const tgt = pathEl.dataset.tgt!;
      const srcNode = nodeMap.get(src);
      const tgtNode = nodeMap.get(tgt);
      if (!srcNode || !tgtNode) return;
      const a = nodeCenter(srcNode, livePosRef.current.get(src));
      const b = nodeCenter(tgtNode, livePosRef.current.get(tgt));
      pathEl.setAttribute("d", edgePath(a.x, a.y, b.x, b.y));
    });

    labels.forEach((g) => {
      const src = g.dataset.src!;
      const tgt = g.dataset.tgt!;
      const srcNode = nodeMap.get(src);
      const tgtNode = nodeMap.get(tgt);
      if (!srcNode || !tgtNode) return;
      const a = nodeCenter(srcNode, livePosRef.current.get(src));
      const b = nodeCenter(tgtNode, livePosRef.current.get(tgt));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      g.setAttribute("transform", `translate(${mx}, ${my})`);
    });
  }, [nodeMap]);

  const flushPointer = useCallback(() => {
    rafRef.current = null;
    const pending = pendingPointerRef.current;
    if (!pending) return;
    pendingPointerRef.current = null;

    if (isPanningRef.current) {
      const next = {
        x: pending.x - panOriginRef.current.x,
        y: pending.y - panOriginRef.current.y,
      };
      panRef.current = next;
      applyWorldTransform(next.x, next.y, zoomRef.current);
      return;
    }

    const id = draggingIdRef.current;
    if (!id || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const z = zoomRef.current;
    const p = panRef.current;
    const origin = dragOriginRef.current;
    const canvasX = (pending.x - rect.left - p.x) / z;
    const canvasY = (pending.y - rect.top - p.y) / z;
    const startCanvasX = (origin.pointerX - rect.left - p.x) / z;
    const startCanvasY = (origin.pointerY - rect.top - p.y) / z;
    const newX = origin.nodeX + (canvasX - startCanvasX);
    const newY = origin.nodeY + (canvasY - startCanvasY);

    livePosRef.current.set(id, { x: newX, y: newY });

    const el = containerRef.current.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
    if (el) {
      el.style.left = `${Math.round(newX)}px`;
      el.style.top = `${Math.round(newY)}px`;
    }
    redrawEdges();
  }, [applyWorldTransform, redrawEdges]);

  const schedulePointer = useCallback(
    (x: number, y: number) => {
      pendingPointerRef.current = { x, y };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(flushPointer);
    },
    [flushPointer]
  );

  const handleSurfacePointerDown = useCallback(
    (e: React.PointerEvent) => {
      onSurfacePointerDown?.();
      const target = e.target as HTMLElement;
      const isSurface =
        target === containerRef.current ||
        target.getAttribute("data-canvas-surface") === "true" ||
        target.tagName === "svg" ||
        target.closest("[data-canvas-surface='true']");

      if (e.button !== 0 || !isSurface || target.closest("[data-node-id]")) return;

      isPanningRef.current = true;
      panOriginRef.current = {
        x: e.clientX - panRef.current.x,
        y: e.clientY - panRef.current.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onSelectNode(null);
    },
    [onSelectNode, onSurfacePointerDown]
  );

  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onSelectNode(nodeId);

      const now = performance.now();
      if (
        lastNodeClickRef.current &&
        lastNodeClickRef.current.id === nodeId &&
        now - lastNodeClickRef.current.time < 350 &&
        Math.hypot(e.clientX - lastNodeClickRef.current.x, e.clientY - lastNodeClickRef.current.y) < 8
      ) {
        lastNodeClickRef.current = null;
        onNodeDoubleClick?.(nodeId);
      } else {
        lastNodeClickRef.current = { id: nodeId, time: now, x: e.clientX, y: e.clientY };
      }

      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      draggingIdRef.current = nodeId;
      dragOriginRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
      };
      livePosRef.current.set(nodeId, { x: node.x, y: node.y });
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [onNodeDoubleClick, onSelectNode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanningRef.current && !draggingIdRef.current) return;
      schedulePointer(e.clientX, e.clientY);
    },
    [schedulePointer]
  );

  const endGesture = useCallback(
    (e: React.PointerEvent) => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        flushPointer();
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        onPanChange({ ...panRef.current });
      }

      const id = draggingIdRef.current;
      if (id) {
        const pos = livePosRef.current.get(id);
        draggingIdRef.current = null;
        if (pos) onNodePositionCommit(id, Math.round(pos.x), Math.round(pos.y));
      }

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [flushPointer, onPanChange, onNodePositionCommit]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const next = Math.max(0.25, Math.min(2.5, zoomRef.current * factor));
      zoomRef.current = next;
      applyWorldTransform(panRef.current.x, panRef.current.y, next);
      onZoomChange(next);
    },
    [applyWorldTransform, onZoomChange]
  );

  // Keep zoom in sync when parent changes zoom via toolbar buttons
  useEffect(() => {
    zoomRef.current = zoom;
    applyWorldTransform(panRef.current.x, panRef.current.y, zoom);
  }, [zoom, applyWorldTransform]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing touch-none bg-background"
      data-canvas-surface="true"
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onWheel={handleWheel}
      onContextMenu={(e) => onContextMenu(e)}
    >
      {/* World layer: pan/zoom via CSS transform — no React state during gesture */}
      <div
        ref={worldRef}
        data-canvas-surface="true"
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* Light translucent slate dots — moves with world */}
        <div
          data-canvas-surface="true"
          className="absolute pointer-events-none"
          style={{
            left: -4000,
            top: -4000,
            width: 12000,
            height: 12000,
            backgroundImage: "radial-gradient(rgba(148, 163, 184, 0.28) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />

        <svg
          ref={edgesSvgRef}
          className="absolute overflow-visible pointer-events-none"
          style={{ left: 0, top: 0, width: 1, height: 1, overflow: "visible" }}
        >
          {edges.map((edge) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;
            const c1 = nodeCenter(src);
            const c2 = nodeCenter(tgt);
            const x1 = c1.x;
            const y1 = c1.y;
            const x2 = c2.x;
            const y2 = c2.y;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const labelW = edge.label ? edge.label.length * 6.4 + 16 : 0;

            return (
              <g key={edge.id}>
                <path
                  data-edge-path
                  data-src={edge.source}
                  data-tgt={edge.target}
                  d={edgePath(x1, y1, x2, y2)}
                  fill="none"
                  stroke={edge.kind === "flow" ? (edge.label === "against" ? "#ff453a" : "#0a84ff") : apple.edge}
                  strokeWidth={edge.kind === "flow" ? 1.75 : 1.5}
                  strokeDasharray={edge.kind === "flow" ? "2 4" : edge.animated ? "5 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {edge.label && (
                  <g data-edge-label data-src={edge.source} data-tgt={edge.target} transform={`translate(${mx}, ${my})`}>
                    <rect
                      x={-labelW / 2}
                      y={-9}
                      width={labelW}
                      height={18}
                      rx={9}
                      fill={apple.labelBg}
                      stroke={apple.hairline}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={4}
                      fill="#98989d"
                      fontSize={11}
                      fontFamily="'Google Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
                      fontWeight={500}
                      letterSpacing="-0.01em"
                      textAnchor="middle"
                      style={{ textRendering: "geometricPrecision" }}
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            selected={allSelected || selectedNodeId === node.id}
            runChip={runChips?.[node.id]}
            onRetryRun={onRetryRun}
            onCancelRun={onCancelRun}
            onPointerDown={handleNodePointerDown}
            onDoubleClick={(_e, id) => onNodeDoubleClick?.(id)}
            onContextMenu={onContextMenu}
            onPortPointerDown={(_event, nodeId, side, port) => {
              if (side === "out") portLinkRef.current = { sourceId: nodeId, port };
            }}
          />
        ))}
      </div>

      {/* Edge vignette — soft inner shadow + radial fade into system background */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          boxShadow:
            "inset 0 0 100px 45px hsl(var(--background)), inset 0 0 35px 15px hsl(var(--background))",
          background:
            "radial-gradient(ellipse at center, transparent 45%, hsl(var(--background) / 0.75) 85%, hsl(var(--background)) 100%)",
        }}
      />

      {/* Studio mark — pure vector (no CSS mask: masks force bitmap rasterization) */}
      <div
        className="absolute bottom-6 left-4 z-[11] pointer-events-none select-none"
        aria-hidden
      >
        <StudioMark height={12} style={{ color: "rgba(148, 163, 184, 0.5)" }} />
      </div>
    </div>
  );
}
