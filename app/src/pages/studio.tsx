import React, { startTransition, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FolderOpen,
  User,
  Gavel,
  Clock,
  FileText,
  Bot,
  Link2,
  Plus,
  Minus,
  X,
  Upload,
  Trash2,
  Unlink,
  Eye,
  Calendar,
  Layers,
  Scan,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  ArrowUp,
  ChevronRight,
  ImageOff,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { GraphCanvas, type StudioEdge } from "@/components/studio/GraphCanvas";
import { getNodeConfig, flowPorts, type RunChip } from "@/components/studio/GraphNode";
import { CaseFileExplorer } from "@/components/studio/CaseFileExplorer";
import { StudioContextMenu } from "@/components/studio/StudioContextMenu";
import { getCanvasMenu, getNodeMenu } from "@/components/studio/contextMenuModel";
import { buildPrecedentQuery, flowSubgraph, precedentNodes, templateChain } from "@/components/studio/studioActionHelpers";
import { CopyText, FieldInput, NodeEdit, NodeOverview, NodeVault } from "@/components/studio/NodeFields";
import { LiquidGlassWindow } from "@/components/studio/LiquidGlassWindow";
import { GlassSelect } from "@/components/studio/GlassSelect";
import { InspectorSkeleton } from "@/components/studio/InspectorSkeleton";
import {
  AUTOMATION_NODE_TYPES,
  CREATE_FIELD_KEYS,
  NODE_FIELDS,
  NODE_ID_FIELD,
  buildStudioNode,
  createNodeData,
  duplicateStudioNode,
  migrateStudioNode,
  newStudioNodeId,
  nodeDataRecord,
  syncNodeIdentity,
  type CaseClientRecord,
  type CaseFileRecord,
  type CaseFolderRecord,
  type CaseNoteRecord,
  type CasePrecedentRecord,
  type NodeData,
  type NodeType,
  type StudioNode,
} from "@/components/studio/types";
import { apple, appleFont, appleSpring, appleSheetSpring } from "@/components/studio/tokens";
import { courtsFor, familiesFor } from "@shared/jurisdictionCatalog";

/** #iosstyle — sohbet kutusundaki kabuk yayı. */
const IOS_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.75 };

type InspectorFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
};

type InspectorShell = {
  open: boolean;
  openFrame: InspectorFrame;
};

export type { NodeType, StudioNode, StudioEdge };

export interface UniversalParsedDoc {
  format: string;
  formatLabel: string;
  jurisdiction: string;
  title: string;
  court?: string;
  caseNumber?: string;
  parties?: { name: string; role: string }[];
  dates?: { label: string; date: string }[];
  summary: string;
  bodyText: string;
  metadata?: Record<string, any>;
}

// Canvas starts empty. Every node comes from the signed-in user's stored
// graph or from an explicit create / ingest action — no seed data.
export default function StudioPage() {
  const { toast } = useToast();

  // Canvas Viewport State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Nodes & Edges State — hydrated from the user's stored graph
  const [nodes, setNodes] = useState<StudioNode[]>([]);
  const [edges, setEdges] = useState<StudioEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [explorerMatterId, setExplorerMatterId] = useState<string | null>(null);
  const [filePickToken, setFilePickToken] = useState(0);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [inspectorShell, setInspectorShell] = useState<InspectorShell | null>(null);
  const [inspectorClipping, setInspectorClipping] = useState(true);
  const [inspectorDragging, setInspectorDragging] = useState(false);
  const [inspectorMotionLive, setInspectorMotionLive] = useState(false);
  const [inspectorBodyReady, setInspectorBodyReady] = useState(false);

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const minimapBounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, maxX: 1000, minY: 0, maxY: 800, widthSpan: 1000, heightSpan: 800 };
    const minX = Math.min(...nodes.map((n) => n.x), 0) - 80;
    const maxX = Math.max(...nodes.map((n) => n.x), 1000) + 80;
    const minY = Math.min(...nodes.map((n) => n.y), 0) - 80;
    const maxY = Math.max(...nodes.map((n) => n.y), 800) + 80;
    return {
      minX,
      maxX,
      minY,
      maxY,
      widthSpan: maxX - minX || 1,
      heightSpan: maxY - minY || 1,
    };
  }, [nodes]);

  const handleNodePositionCommit = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  // Search State — collapsed icon → expand → live filter as you type
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [searchOpen]);

  const handleSearchCancel = useCallback(() => {
    setSearchOpen(false);
    setSearchDraft("");
  }, []);

  // Base field fits ~15 glyphs; past that, spring-grow to 2× (iOS Spotlight feel)
  const SEARCH_WIDTH_COLLAPSED = 44;
  const SEARCH_WIDTH_BASE = 292;
  const SEARCH_CHAR_CAPACITY = 15;
  const searchBarWidth = !searchOpen
    ? SEARCH_WIDTH_COLLAPSED
    : searchDraft.length > SEARCH_CHAR_CAPACITY
      ? SEARCH_WIDTH_BASE * 2
      : SEARCH_WIDTH_BASE;

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number; targetNodeId?: string } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<NodeType>("matter");

  // Form State for Node Creation (master-model draft)
  const [createDraft, setCreateDraft] = useState<Record<string, any>>({});

  // Universal Document Ingestion Modal State
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [ingestContent, setIngestContent] = useState("");
  const [parsedDoc, setParsedDoc] = useState<UniversalParsedDoc | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Drag and drop file ingestion onto canvas
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);

  // Agentic Calendar Modal State
  const [agenticCalendarOpen, setAgenticCalendarOpen] = useState(false);
  const [agenticJurisdiction, setAgenticJurisdiction] = useState("Türkiye");
  const [agenticTriggerDate, setAgenticTriggerDate] = useState(new Date().toISOString().split("T")[0]);
  const [computedDeadlines, setComputedDeadlines] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [precedentQuery, setPrecedentQuery] = useState("");
  const [advancedNodeId, setAdvancedNodeId] = useState<string | null>(null);
  const [runChips, setRunChips] = useState<Record<string, RunChip>>({});
  const [allSelected, setAllSelected] = useState(false);
  const [defenseDraft, setDefenseDraft] = useState("");
  const [citationGate, setCitationGate] = useState<{ exportAllowed: boolean; items: { raw: string; status: string }[] } | null>(null);
  const [mailConnected, setMailConnected] = useState<boolean | null>(null);
  const approvalPayloads = useRef<Record<string, any[]>>({});
  const placeRef = useRef({ x: 400, y: 300 });
  const runEpoch = useRef<Record<string, number>>({});
  const retryAction = useRef<Record<string, string>>({});
  const activeRunId = useRef<string | null>(null);

  // Linking / Edge Creation State
  const [linkTargetId, setLinkTargetId] = useState<string>("");
  const [linkLabel, setLinkLabel] = useState<string>("Vekil");

  // Inspector State & Editing
  const [inspectorTab, setInspectorTab] = useState<"overview" | "edit" | "relations" | "vault">(
    "overview",
  );
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeImageInputRef = useRef<HTMLInputElement>(null);
  const inspectorShellRef = useRef<HTMLDivElement>(null);
  const inspectorContentRef = useRef<HTMLDivElement>(null);
  const inspectorOpenRef = useRef(false);
  const inspectorShellStateRef = useRef<InspectorShell | null>(null);
  const pendingInspectorOpenRef = useRef(false);
  const pendingInspectorPresentRef = useRef(false);
  const inspectorSettledRef = useRef(false);
  const inspectorBodyReadyRef = useRef(false);
  const inspectorDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);
  inspectorOpenRef.current = isInspectorOpen;
  inspectorShellStateRef.current = inspectorShell;

  const detailFrame = useCallback((height: number): InspectorFrame => {
    const page = containerRef.current;
    const pageWidth = page?.clientWidth ?? window.innerWidth;
    const pageHeight = page?.clientHeight ?? window.innerHeight;
    const width = Math.min(436, Math.max(220, pageWidth - 40));
    const maxH = Math.max(180, pageHeight - 40);
    return {
      left: pageWidth - width - 20,
      top: 20,
      width,
      height: Math.min(Math.max(height, 180), maxH),
      radius: 14,
    };
  }, []);

  const openInspector = useCallback((id: string) => {
    setSelectedNodeId(id);
    setIsInspectorOpen(true);
    if (inspectorShellStateRef.current?.open) return;
    inspectorBodyReadyRef.current = false;
    setInspectorBodyReady(false);
    pendingInspectorOpenRef.current = true;
    pendingInspectorPresentRef.current = false;
    inspectorSettledRef.current = false;
    setInspectorMotionLive(false);
    setInspectorClipping(true);
    setInspectorShell({ open: false, openFrame: detailFrame(360) });
  }, [detailFrame]);

  const closeInspector = useCallback(() => {
    const current = inspectorShellStateRef.current;
    if (!current) {
      setIsInspectorOpen(false);
      return;
    }
    inspectorBodyReadyRef.current = false;
    setInspectorBodyReady(false);
    setInspectorClipping(true);
    setIsInspectorOpen(false);
    setInspectorShell({ ...current, open: false });
  }, []);

  const clampInspectorPoint = useCallback((left: number, top: number, width: number, height: number) => {
    const page = containerRef.current;
    const pageWidth = page?.clientWidth ?? window.innerWidth;
    const pageHeight = page?.clientHeight ?? window.innerHeight;
    return {
      left: Math.min(Math.max(8, left), Math.max(8, pageWidth - width - 8)),
      top: Math.min(Math.max(8, top), Math.max(8, pageHeight - height - 8)),
    };
  }, []);

  const beginInspectorDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const current = inspectorShellStateRef.current;
    const page = containerRef.current;
    const shell = inspectorShellRef.current;
    if (!current?.open || !page || !shell) return;
    event.stopPropagation();
    const pageRect = page.getBoundingClientRect();
    const rect = shell.getBoundingClientRect();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sentetik işaretçide yakalama olmayabilir.
    }
    setInspectorDragging(true);
    inspectorDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left - pageRect.left,
      originTop: rect.top - pageRect.top,
      moved: false,
    };
  };

  const moveInspectorDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = inspectorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const current = inspectorShellStateRef.current;
    if (!current?.open) return;
    const next = clampInspectorPoint(
      drag.originLeft + dx,
      drag.originTop + dy,
      current.openFrame.width,
      current.openFrame.height,
    );
    setInspectorShell((shell) =>
      shell?.open
        ? { ...shell, openFrame: { ...shell.openFrame, left: next.left, top: next.top } }
        : shell,
    );
  };

  const endInspectorDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = inspectorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    inspectorDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInspectorDragging(false);
  };

  // Load Graph from Server
  const { data: serverGraph, isLoading: isGraphLoading } = useQuery({
    queryKey: ["/api/studio/graph"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/studio/graph");
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  // Load saved state if present. Legacy `evidence` nodes are migrated to
  // dossiers so existing workspaces keep working.
  useEffect(() => {
    if (!serverGraph) return;
    if (!serverGraph.graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }
    try {
      const parsed = JSON.parse(serverGraph.graphData);
      if (Array.isArray(parsed.nodes)) {
        const hydrated = parsed.nodes
          .map((node: any) => migrateStudioNode(node))
          .filter((node: StudioNode | null): node is StudioNode => Boolean(node));
        setNodes(hydrated);
      }
      if (Array.isArray(parsed.edges)) setEdges(parsed.edges);
      if (parsed.viewport) {
        if (parsed.viewport.zoom) setZoom(parsed.viewport.zoom);
        if (parsed.viewport.pan) setPan(parsed.viewport.pan);
      }
    } catch (e) {
      console.error("Failed to parse saved graph data:", e);
    }
  }, [serverGraph]);

  // Sync edit draft when selection changes (not on every drag frame)
  useEffect(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    setEditDraft({ ...nodeDataRecord(node) });
    // intentionally omit `nodes` — position drags must not reset the draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // Persist Graph State to Backend
  const saveGraphMutation = useMutation({
    mutationFn: async (payload: { nodes: StudioNode[]; edges: StudioEdge[]; viewport: any }) => {
      await apiRequest("POST", "/api/studio/graph", {
        title: "Universal Legal Canvas",
        graphData: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({ title: "NeoGraph Saved", description: "Canvas state cryptographically synced." });
    },
  });

  const handleSaveCanvas = () => {
    saveGraphMutation.mutate({
      nodes,
      edges,
      viewport: { pan, zoom },
    });
  };

  // Export Canvas to JSON File
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(
      JSON.stringify({ nodes, edges, viewport: { pan, zoom }, exportedAt: new Date().toISOString() }, null, 2)
    );
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `zenos-neograph-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast({ title: "Canvas Exported", description: "Downloaded NeoGraph workspace JSON." });
  };

  // Import Canvas from JSON File
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          const hydrated = parsed.nodes
            .map((node: any) => migrateStudioNode(node))
            .filter((node: StudioNode | null): node is StudioNode => Boolean(node));
          setNodes(hydrated);
        }
        if (parsed.edges && Array.isArray(parsed.edges)) setEdges(parsed.edges);
        if (parsed.viewport) {
          if (parsed.viewport.zoom) setZoom(parsed.viewport.zoom);
          if (parsed.viewport.pan) setPan(parsed.viewport.pan);
        }
        toast({ title: "NeoGraph Loaded", description: `Restored ${parsed.nodes.length} nodes from backup.` });
      } catch (err) {
        toast({ title: "Import Error", description: "Invalid NeoGraph JSON schema.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Clear the canvas. There is no seed workspace to restore.
  const handleResetCanvas = () => {
    if (
      !window.confirm(
        "Tuvaldeki tüm düğümler ve bağlantılar silinecek. Devam edilsin mi?",
      )
    ) {
      return;
    }
    const emptyViewport = { pan: { x: 0, y: 0 }, zoom: 1 };
    setNodes([]);
    setEdges([]);
    setPan(emptyViewport.pan);
    setZoom(1);
    setSelectedNodeId(null);
    setIsInspectorOpen(false);
    saveGraphMutation.mutate({ nodes: [], edges: [], viewport: emptyViewport });
    toast({ title: "Tuval temizlendi", description: "Tüm düğümler ve bağlantılar kaldırıldı." });
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, targetNodeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = Math.min(e.clientX, window.innerWidth - 260);
    const screenY = Math.min(e.clientY, window.innerHeight - 360);
    const canvasX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const canvasY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    placeRef.current = { x: canvasX, y: canvasY };
    setContextMenu({
      x: screenX,
      y: screenY,
      canvasX,
      canvasY,
      targetNodeId,
    });
  }, []);

  // Focus Node from Search Bar or Minimap
  const handleFocusNode = useCallback((node: StudioNode) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setPan({
      x: centerX - node.x * zoom,
      y: centerY - node.y * zoom,
    });
    setSelectedNodeId(node.id);
  }, [zoom]);

  // Live omni-search — filters as soon as draft has characters
  const searchResults = useMemo(() => {
    const query = searchDraft.trim().toLowerCase();
    if (!query) return [];
    return nodes.filter((n) => {
      if (
        n.title.toLowerCase().includes(query) ||
        (n.subtitle && n.subtitle.toLowerCase().includes(query)) ||
        (n.jurisdiction && n.jurisdiction.toLowerCase().includes(query)) ||
        n.type.toLowerCase().includes(query) ||
        (n.status && n.status.toLowerCase().includes(query))
      ) {
        return true;
      }
      return Object.values(nodeDataRecord(n)).some(
        (value) => typeof value === "string" && value.toLowerCase().includes(query),
      );
    });
  }, [nodes, searchDraft]);

  const handleSearchSelectFirst = useCallback(() => {
    const first = searchResults[0];
    if (!first) return;
    handleFocusNode(first);
    handleSearchCancel();
  }, [searchResults, handleFocusNode, handleSearchCancel]);

  // Create a node from the master-model draft
  const handleCreateNode = (type: NodeType) => {
    const x = placeRef.current.x;
    const y = placeRef.current.y;
    const id = newStudioNodeId(type);

    const data = {
      ...createNodeData(type, id),
      ...createDraft,
      [NODE_ID_FIELD[type]]: id,
    } as NodeData;

    const newNode = buildStudioNode(type, id, x, y, data);

    setNodes((prev) => [...prev, newNode]);
    setCreateModalOpen(false);
    setContextMenu(null);
    setCreateDraft({});
    openInspector(newNode.id);
    toast({ title: "Düğüm oluşturuldu", description: `${type} tuvale eklendi.` });
  };

  // Assign / replace the thumbnail shown in the inspector header
  const handleNodeImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedNodeId) return;
    const nodeId = selectedNodeId;

    const commit = (image: string) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, image } : n)),
      );
    };

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const source = reader.result;

      // Downscale to a 256px thumbnail so the graph payload stays light.
      const image = new Image();
      image.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          commit(source);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        commit(canvas.toDataURL("image/webp", 0.86));
      };
      image.onerror = () => commit(source);
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  // Commit the full master-model draft back to the node
  const handleSaveNodeEdits = () => {
    if (!selectedNodeId) return;
    const current = nodes.find((n) => n.id === selectedNodeId);
    if (!current) return;

    const data = { ...editDraft } as NodeData;
    const updated = syncNodeIdentity({ ...current, data } as StudioNode);

    setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? updated : n)));
    setInspectorTab("overview");
    toast({ title: "Kaydedildi", description: "Düğüm alanları güncellendi." });
  };

  const handleRemoveDraftKey = (key: string) => {
    setEditDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Duplicate Selected Node
  const handleDuplicateSelectedNode = () => {
    if (!selectedNode) return;
    const cloned = duplicateStudioNode(selectedNode);
    setNodes((prev) => [...prev, cloned]);
    setSelectedNodeId(cloned.id);
    toast({ title: "Düğüm çoğaltıldı", description: "Kopya tuvale eklendi." });
  };

  // Copy Dossier JSON
  const handleCopyNodeJson = () => {
    if (!selectedNode) return;
    navigator.clipboard.writeText(JSON.stringify(selectedNode, null, 2));
    toast({ title: "Copied to Clipboard", description: "Dossier JSON payload copied." });
  };

  // Add Edge Connection between Selected Node and another node
  const handleCreateEdge = (targetId: string, label: string) => {
    if (!selectedNodeId || !targetId || selectedNodeId === targetId) return;
    const existing = edges.find(
      (e) => (e.source === selectedNodeId && e.target === targetId) || (e.source === targetId && e.target === selectedNodeId)
    );
    if (existing) {
      toast({ title: "Connection Exists", description: "Nodes are already linked.", variant: "destructive" });
      return;
    }

    const source = nodes.find((node) => node.id === selectedNodeId);
    const target = nodes.find((node) => node.id === targetId);
    const sourcePort = source ? flowPorts(source.type).out : undefined;
    const targetPort = target ? flowPorts(target.type).in : undefined;
    const flow = Boolean(sourcePort && targetPort);
    const newEdge: StudioEdge = {
      id: `e-${Date.now()}`,
      source: selectedNodeId,
      target: targetId,
      label: flow ? sourcePort : label || "Bağlantı",
      kind: flow ? "flow" : "relation",
      sourcePort: flow ? sourcePort : undefined,
      targetPort: flow ? targetPort : undefined,
      animated: false,
    };

    setEdges((prev) => [...prev, newEdge]);
    setLinkTargetId("");
    toast({ title: "Relationship Linked", description: `Connected with label: ${newEdge.label}` });
  };

  // Delete Edge
  const handleDeleteEdge = (edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    toast({ title: "Bağlantı kaldırıldı", description: "İlişki silindi." });
  };

  // Live relationship-type editing
  const handleUpdateEdgeLabel = (edgeId: string, label: string) => {
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, label } : e)));
  };

  // Parsed legal documents always become Dossier nodes
  const buildDossierFromParsed = (
    parsed: UniversalParsedDoc,
    x: number,
    y: number,
    fallbackTitle: string,
  ): StudioNode => {
    const id = newStudioNodeId("dossier");
    const data = {
      ...(createNodeData("dossier", id) as Record<string, any>),
      title: parsed.title || fallbackTitle,
      format: parsed.formatLabel || parsed.format || "",
      description: parsed.summary || "",
      checksum: parsed.metadata?.checksum || "",
      zenvault_secured: Boolean(parsed.metadata?.vaultBlobId),
      document_type: parsed.metadata?.documentType || "Exhibit",
    } as NodeData;
    return buildStudioNode("dossier", id, x, y, data);
  };

  // Direct File Drag-and-Drop Ingestion on Canvas
  const addCaseFiles = async (matterId: string, list: File[], folder: string) => {
    const additions: CaseFileRecord[] = [];
    for (const file of list) {
      let preview = "";
      if (file.type.startsWith("text") || /\.(txt|xml|json|md|csv|html|udf)$/i.test(file.name)) {
        preview = (await file.text()).slice(0, 8000);
      }
      additions.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        folder,
        title: file.name,
        preview,
      });
    }
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== matterId || node.type !== "matter") return node;
        const data = nodeDataRecord(node);
        const existing = Array.isArray(data.case_files) ? (data.case_files as CaseFileRecord[]) : [];
        return syncNodeIdentity({
          ...node,
          data: { ...data, case_files: [...additions, ...existing] },
        } as StudioNode);
      }),
    );
    closeInspector();
    setExplorerMatterId(matterId);
  };

  const handleDropFilesOnCanvas = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverCanvas(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const matterId =
      explorerMatterId ||
      nodes.find((node) => node.id === selectedNodeId && node.type === "matter")?.id ||
      nodes.find((node) => node.type === "matter")?.id ||
      null;
    if (!matterId) {
      toast({
        title: "Dava yok",
        description: "Evrak tuvale düğüm olarak eklenmez. Önce bir dava oluşturun.",
      });
      return;
    }
    await addCaseFiles(matterId, files, "documents");
    toast({ title: "Evrak eklendi", description: `${files.length} dosya dava klasöründe.` });
  };

  // Agentic Deadlines Computation
  const handleComputeDeadlines = async () => {
    try {
      const matter = nodes.find((node) => node.id === selectedNodeId && node.type === "matter");
      const family = matter ? String((matter.data as { procedure_family?: string }).procedure_family || "") : "";
      const res = await apiRequest("POST", "/api/studio/agentic-deadlines", {
        jurisdiction: agenticJurisdiction,
        procedureFamily: family,
        serviceDate: agenticTriggerDate,
      });
      const data = await res.json();
      setComputedDeadlines(data.deadlines || []);
      toast({ title: "Agentic Calculation Complete", description: `Computed ${data.deadlines?.length} statutory deadlines.` });
    } catch (e: any) {
      toast({ title: "Computation Error", description: e.message, variant: "destructive" });
    }
  };

  const pinDeadlines = (items: any[]) => {
    const newDeadlineNodes: StudioNode[] = items.map((dl, idx) => {
      const id = newStudioNodeId("deadline");
      const data = {
        ...(createNodeData("deadline", id) as Record<string, any>),
        title: dl.title,
        due_date: dl.dueDate,
        priority: dl.urgency === "critical" ? "Critical" : dl.urgency === "warning" ? "Normal" : "Low",
        type: "Statutory Cutoff",
      } as NodeData;
      return buildStudioNode("deadline", id, 520 + idx * 170, 440 + (idx % 2 === 0 ? 50 : -50), data);
    });
    setNodes((prev) => [...prev, ...newDeadlineNodes]);
    setAgenticCalendarOpen(false);
    toast({ title: "Süreler eklendi", description: `${newDeadlineNodes.length} süre düğümü tuvale yerleştirildi.` });
  };

  const refreshApprovals = async () => {
    const res = await apiRequest("GET", "/api/studio/approvals");
    setApprovals(await res.json());
  };

  const handleSpawnDeadlineNodes = async () => {
    if (!computedDeadlines.length) return;
    const res = await apiRequest("POST", "/api/studio/approvals", {
      effect: "write",
      title: "Süreleri takvime yaz",
      content: computedDeadlines.map((dl) => `${dl.statute || dl.ruleCitation}: ${dl.title}`).join("\n"),
      diff: "Süre düğümleri onaydan sonra tuvale yazılır.",
    });
    const data = await res.json();
    if (data.approvalId) approvalPayloads.current[data.approvalId] = computedDeadlines;
    await refreshApprovals();
    toast({ title: "Onay bekleniyor", description: "Süreler onay kartından geçmeden takvime yazılmaz." });
  };

  const decideCard = async (id: string, decision: "approved" | "rejected") => {
    await apiRequest("POST", `/api/studio/approvals/${id}`, { decision });
    if (decision === "approved" && approvalPayloads.current[id]) {
      pinDeadlines(approvalPayloads.current[id]);
      delete approvalPayloads.current[id];
    }
    await refreshApprovals();
    setRunChips((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([nodeId, chip]) => {
        if (chip.message === "Onay bekleniyor") {
          next[nodeId] = { status: decision === "approved" ? "done" : "error", message: decision === "approved" ? "Onaylandı" : "Reddedildi" };
        }
      });
      return next;
    });
  };

  const setChip = (id: string, chip: RunChip | null) => {
    setRunChips((prev) => {
      const next = { ...prev };
      if (chip) next[id] = chip;
      else delete next[id];
      return next;
    });
  };

  const beginChip = (id: string, actionId: string, message: string) => {
    const epoch = (runEpoch.current[id] || 0) + 1;
    runEpoch.current[id] = epoch;
    retryAction.current[id] = actionId;
    setChip(id, { status: "running", message });
    return epoch;
  };

  const chipAlive = (id: string, epoch: number) => runEpoch.current[id] === epoch;

  const contextNode = () => {
    const id = contextMenu?.targetNodeId;
    return id ? nodes.find((node) => node.id === id) || null : null;
  };

  const dropConnector = (connectorId: string) => {
    const id = newStudioNodeId("connector");
    const data = {
      ...(createNodeData("connector", id) as Record<string, any>),
      name: connectorId,
      connector_id: connectorId,
      effect: connectorId === "gmail" || connectorId === "outlook" ? "read" : "read",
    } as NodeData;
    const node = buildStudioNode("connector", id, placeRef.current.x, placeRef.current.y, data);
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };

  const spawnTemplate = (kind: "precedent" | "defense" | "deadlines", anchor?: StudioNode) => {
    const origin = anchor
      ? { x: anchor.x + 40, y: anchor.y + 150 }
      : placeRef.current;
    const steps = kind === "precedent"
      ? [
          { type: "trigger" as const, name: "Elle tetik", effect: "read" },
          { type: "connector" as const, name: "Danıştay", connector_id: "danistay", effect: "read" },
          { type: "ai_step" as const, name: "Emsal sırala", effect: "draft" },
          { type: "output" as const, name: "Dosyaya yaz", effect: "read" },
        ]
      : kind === "defense"
        ? [
            { type: "trigger" as const, name: "Elle tetik", effect: "read" },
            { type: "ai_step" as const, name: "Savunma taslağı", effect: "draft" },
            { type: "output" as const, name: "Taslak dosya", effect: "draft" },
          ]
        : [
            { type: "trigger" as const, name: "Süre tetiği", effect: "read" },
            { type: "ai_step" as const, name: "Süre motoru", effect: "draft" },
            { type: "approval" as const, name: "Takvime yaz", effect: "write" },
            { type: "output" as const, name: "Süre düğümü", effect: "write" },
          ];
    const chain = templateChain(origin, steps);
    setNodes((prev) => [...prev, ...chain.nodes]);
    setEdges((prev) => [...prev, ...chain.edges]);
  };

  const runPrecedent = async (
    node: StudioNode,
    courts: Array<"danistay" | "uyap-emsal" | "aym">,
    query: string,
    actionId: string,
  ) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setChip(node.id, { status: "error", message: "Aranacak metin yok" });
      retryAction.current[node.id] = actionId;
      return;
    }
    const epoch = beginChip(node.id, actionId, courts.length > 1 ? "Mahkemeler" : "Emsal aranıyor");
    try {
      const hits: { title?: string; citation?: string; snippet?: string; relation?: string }[] = [];
      for (const court of courts) {
        const res = await apiRequest("POST", "/api/studio/precedent", { query: trimmed, court });
        const data = await res.json();
        if (Array.isArray(data.hits)) hits.push(...data.hits);
      }
      if (!chipAlive(node.id, epoch)) return;
      if (!hits.length) {
        setChip(node.id, { status: "done", message: "Sonuç yok" });
        return;
      }
      const created = precedentNodes(hits, node);
      setNodes((prev) => [...prev, ...created.nodes]);
      setEdges((prev) => [...prev, ...created.edges]);
      setChip(node.id, { status: "done", message: `${created.nodes.length} karar` });
    } catch (error: any) {
      if (!chipAlive(node.id, epoch)) return;
      setChip(node.id, { status: "error", message: error?.message || "Arama başarısız" });
    }
  };

  const runWorkflowGraph = async (graph: { nodes: StudioNode[]; edges: StudioEdge[] }, message: string) => {
    const orphans = graph.nodes.filter(
      (node) => node.type === "trigger" && !graph.edges.some((edge) => edge.kind !== "relation" && edge.source === node.id),
    );
    if (orphans.length) {
      toast({ title: "Tetik bağlı değil", description: "Akış kenarı olmayan tetik sonuç üretmez." });
    }
    const ids = graph.nodes.map((node) => node.id);
    ids.forEach((id) => beginChip(id, "workflow.run", message));
    try {
      const res = await apiRequest("POST", "/api/studio/workflow/run", { graph, allowWrite: false });
      const data = await res.json();
      if (data.runId) activeRunId.current = data.runId;
      await refreshApprovals();
      const label = data.status === "waiting" ? "Onay bekleniyor" : data.status === "stopped" ? "Durduruldu" : "Tamam";
      ids.forEach((id) => setChip(id, { status: data.status === "waiting" ? "running" : "done", message: label }));
      const outputs = (data.outputs || {}) as Record<string, { text?: string; title?: string }>;
      const matter = graph.nodes.find((node) => node.type === "matter") || nodes.find((node) => node.type === "matter");
      for (const node of graph.nodes) {
        if (node.type !== "output") continue;
        const text = outputs[node.id]?.text;
        if (!text) continue;
        const id = newStudioNodeId("dossier");
        const dossier = buildStudioNode("dossier", id, node.x + 280, node.y, {
          ...(createNodeData("dossier", id) as Record<string, any>),
          title: outputs[node.id]?.title || "Akış çıktısı",
          description: text,
          document_type: "Exhibit",
        } as NodeData);
        setNodes((prev) => [...prev, dossier]);
        setEdges((prev) => [
          ...prev,
          { id: `e-${id}`, source: node.id, target: id, label: "çıktı", kind: "relation", animated: false },
        ]);
        if (matter) {
          void apiRequest("POST", `/api/studio/matters/${encodeURIComponent(matter.id)}/files`, {
            filename: `${dossier.title || "cikti"}.txt`,
            preview: text,
            content: text,
          }).catch(() => undefined);
        }
      }
    } catch (error: any) {
      ids.forEach((id) => setChip(id, { status: "error", message: error?.message || "Akış başarısız" }));
    }
  };

  const readMail = async (connectorId: "gmail" | "outlook", attachTo?: StudioNode | null) => {
    if (attachTo) beginChip(attachTo.id, `mail.attach.${connectorId}`, "Posta okunuyor");
    try {
      const res = await apiRequest("POST", "/api/studio/mail/inbox", { connectorId });
      const data = await res.json();
      setMailConnected(Boolean(data.connected));
      if (!data.connected) {
        if (attachTo) setChip(attachTo.id, { status: "error", message: "Hesap bağlı değil" });
        else toast({ title: "Hesap bağlı değil", description: "Yalnızca okuma. Gönderim yok." });
        return;
      }
      const messages = Array.isArray(data.messages) ? data.messages : [];
      if (attachTo && messages.length) {
        const created: StudioNode[] = messages.slice(0, 8).map((message: any, index: number) => {
          const id = newStudioNodeId("dossier");
          const nodeData = {
            ...(createNodeData("dossier", id) as Record<string, any>),
            title: message.subject || "İleti",
            description: message.snippet || "",
            document_type: "Exhibit",
          } as NodeData;
          return buildStudioNode("dossier", id, attachTo.x + 280, attachTo.y + index * 110, nodeData);
        });
        setNodes((prev) => [...prev, ...created]);
        setEdges((prev) => [
          ...prev,
          ...created.map((node) => ({
            id: `e-${node.id}`,
            source: attachTo.id,
            target: node.id,
            label: "posta",
            kind: "flow" as const,
          })),
        ]);
      }
      if (attachTo) setChip(attachTo.id, { status: "done", message: `${messages.length} ileti` });
    } catch (error: any) {
      if (attachTo) setChip(attachTo.id, { status: "error", message: error?.message || "Posta okunamadı" });
    }
  };

  const writeDefense = async (matter: StudioNode | null, extraNote?: string) => {
    const record = matter ? nodeDataRecord(matter) : {};
    const parties = Array.isArray(record.parties) ? record.parties.map((party: any) => party.name || "") : [];
    const notes = nodes.filter((node) => node.type === "dossier").map((node) => node.title);
    if (extraNote) notes.unshift(extraNote);
    const precedents = nodes
      .filter((node) => node.type === "dossier" && String(nodeDataRecord(node).document_type) === "Precedent")
      .map((node) => ({
        citation: String(nodeDataRecord(node).exhibit_number || node.title),
        relation: "supports",
        snippet: String(nodeDataRecord(node).description || ""),
      }));
    const anchor = matter?.id || contextNode()?.id;
    if (anchor) beginChip(anchor, "defense.draft", "Taslak");
    const res = await apiRequest("POST", "/api/studio/defense-draft", {
      matterTitle: matter?.title || "",
      parties,
      dossierNotes: notes,
      precedents,
    });
    const data = await res.json();
    setDefenseDraft(data.text || "");
    setCitationGate(data.citation || null);
    if (matter) {
      const id = newStudioNodeId("dossier");
      const nodeData = {
        ...(createNodeData("dossier", id) as Record<string, any>),
        title: "Savunma taslağı",
        document_type: "Memorial",
        description: data.text || "",
      } as NodeData;
      const draftNode = buildStudioNode("dossier", id, matter.x + 280, matter.y + 40, nodeData);
      setNodes((prev) => [...prev, draftNode]);
      setEdges((prev) => [...prev, { id: `e-${draftNode.id}`, source: matter.id, target: draftNode.id, label: "taslak", kind: "flow" }]);
      setChip(matter.id, {
        status: data.citation?.exportAllowed ? "done" : "error",
        message: data.citation?.exportAllowed ? "Taslak hazır" : "Dışa aktarma kapalı",
      });
    }
  };

  const runStudioAction = async (id: string, forcedNodeId?: string) => {
    const node = forcedNodeId
      ? nodes.find((item) => item.id === forcedNodeId) || null
      : contextNode();
    if (id.startsWith("node.create.")) {
      const type = id.slice("node.create.".length) as NodeType;
      if (type === "dossier") {
        const matterId =
          nodes.find((item) => item.id === selectedNodeId && item.type === "matter")?.id ||
          nodes.find((item) => item.type === "matter")?.id ||
          null;
        if (!matterId) {
          toast({ title: "Dava yok", description: "Evrak, dava dosyasının içinde durur. Önce bir dava oluşturun." });
          return;
        }
        closeInspector();
        setExplorerMatterId(matterId);
        setFilePickToken((value) => value + 1);
        return;
      }
      setCreateType(type);
      setCreateDraft(createNodeData(type, ""));
      setCreateModalOpen(true);
      return;
    }
    if (id.startsWith("node.connector.")) {
      dropConnector(id.slice("node.connector.".length));
      return;
    }
    if (id === "ingest.open" || id === "matter.addFile") {
      const matterId =
        (id === "matter.addFile" && node?.type === "matter" ? node.id : null) ||
        nodes.find((item) => item.id === selectedNodeId && item.type === "matter")?.id ||
        nodes.find((item) => item.type === "matter")?.id ||
        null;
      if (!matterId) {
        toast({
          title: "Dava yok",
          description: "Evrak tuvale düğüm olarak eklenmez. Önce bir dava oluşturun.",
        });
        return;
      }
      closeInspector();
      setExplorerMatterId(matterId);
      setFilePickToken((value) => value + 1);
      return;
    }
    if (id === "template.precedent" || id === "template.defense" || id === "template.deadlines") {
      spawnTemplate(id === "template.precedent" ? "precedent" : id === "template.defense" ? "defense" : "deadlines", node || undefined);
      return;
    }
    if (id === "canvas.selectAll") {
      setAllSelected(true);
      return;
    }
    if (id === "canvas.import") {
      fileInputRef.current?.click();
      return;
    }
    if (id === "canvas.export") {
      handleExportJson();
      return;
    }
    if (id === "canvas.clear") {
      handleResetCanvas();
      return;
    }
    if (id === "canvas.paste") {
      try {
        const text = await navigator.clipboard.readText();
        const pasted = migrateStudioNode(JSON.parse(text));
        if (!pasted) return;
        const placed = { ...pasted, x: placeRef.current.x, y: placeRef.current.y };
        setNodes((prev) => [...prev, placed]);
      } catch {
        toast({ title: "Yapıştırılamadı", description: "Panoda düğüm yok.", variant: "destructive" });
      }
      return;
    }
    if (id === "connect.mail.gmail" || id === "mail.attach.gmail") {
      await readMail("gmail", id.startsWith("mail.attach") ? node : null);
      return;
    }
    if (id === "connect.mail.outlook") {
      await readMail("outlook", null);
      return;
    }
    if (id === "node.inspect" || id === "node.settings" || id === "agent.log") {
      if (node) openInspector(node.id);
      if (id === "agent.log" && node) {
        setChip(node.id, { status: runChips[node.id]?.status || "done", message: runChips[node.id]?.message || "Kayıt yok" });
      }
      return;
    }
    if (id === "node.link" || id === "entity.link" || id === "vault.open") {
      if (!node) return;
      setInspectorTab(id === "vault.open" ? "vault" : "relations");
      openInspector(node.id);
      return;
    }
    if (id === "node.duplicate" && node) {
      const cloned = duplicateStudioNode(node);
      setNodes((prev) => [...prev, cloned]);
      setSelectedNodeId(cloned.id);
      return;
    }
    if (id === "node.delete" && node) {
      setNodes((prev) => prev.filter((item) => item.id !== node.id));
      setEdges((prev) => prev.filter((edge) => edge.source !== node.id && edge.target !== node.id));
      if (selectedNodeId === node.id) setSelectedNodeId(null);
      setInspectorShell(null);
      return;
    }
    if (id === "agent.stop") {
      if (node) {
        runEpoch.current[node.id] = (runEpoch.current[node.id] || 0) + 1;
        setChip(node.id, { status: "done", message: "Durduruldu" });
      }
      if (activeRunId.current) await apiRequest("POST", "/api/studio/workflow/stop", { runId: activeRunId.current });
      return;
    }
    if ((id === "node.run" || id === "step.from" || id === "workflow.run") && (node || id === "workflow.run")) {
      const anchor = node && (AUTOMATION_NODE_TYPES.includes(node.type) || node.type === "agent") ? node.id : null;
      const graph = anchor ? flowSubgraph(anchor, nodes, edges) : { nodes, edges };
      await runWorkflowGraph(graph, id === "workflow.run" ? "Akış" : "Çalışıyor");
      return;
    }
    if ((id === "step.run" || id === "step.dry") && node) {
      await runWorkflowGraph({ nodes: [node], edges: [] }, id === "step.dry" ? "Deneme" : "Adım");
      return;
    }
    if (id.startsWith("port.") && node) {
      const port = id.slice("port.".length);
      const data = { ...nodeDataRecord(node), ports_out: port } as NodeData;
      setNodes((prev) => prev.map((item) => (item.id === node.id ? syncNodeIdentity({ ...item, data } as StudioNode) : item)));
      return;
    }
    if (id.startsWith("precedent.") && node) {
      if (id === "precedent.advanced") {
        setPrecedentQuery(buildPrecedentQuery(node, nodes, edges));
        setAdvancedNodeId(node.id);
        return;
      }
      const courts = id === "precedent.all"
        ? (["danistay", "uyap-emsal", "aym"] as const)
        : ([id.slice("precedent.".length)] as Array<"danistay" | "uyap-emsal" | "aym">);
      await runPrecedent(node, [...courts], buildPrecedentQuery(node, nodes, edges), id);
      return;
    }
    if (id === "defense.draft" || id === "defense.add") {
      const matter = node?.type === "matter"
        ? node
        : nodes.find((item) => item.type === "matter") || null;
      await writeDefense(matter, node?.type === "dossier" ? node.title : undefined);
      return;
    }
    if (id === "deadlines.open") {
      setAgenticCalendarOpen(true);
      return;
    }
    if (id === "deadlines.pin" && node) {
      await apiRequest("POST", "/api/studio/approvals", {
        effect: "write",
        title: "Süreyi takvime yaz",
        content: `${node.title}`,
        diff: "Mevcut süre düğümü onaydan sonra takvim kaydı sayılır.",
      });
      await refreshApprovals();
      setChip(node.id, { status: "running", message: "Onay bekleniyor" });
      return;
    }
    if (id === "deadline.raise" && node) {
      const data = { ...nodeDataRecord(node), priority: "Critical" } as NodeData;
      setNodes((prev) => prev.map((item) => (item.id === node.id ? syncNodeIdentity({ ...item, data } as StudioNode) : item)));
      return;
    }
    if ((id === "deadline.remind" || id === "hearing.checklist" || id === "entity.conflict") && node) {
      const title = id === "deadline.remind" ? `Hatırlatıcı: ${node.title}` : id === "hearing.checklist" ? `Checklist: ${node.title}` : `Çıkar çatışması: ${node.title}`;
      const dossierId = newStudioNodeId("dossier");
      const data = {
        ...(createNodeData("dossier", dossierId) as Record<string, any>),
        title,
        description: id === "hearing.checklist" ? "Dosya, tebligat, vekâlet ve süre kontrolü." : "",
      } as NodeData;
      const created = buildStudioNode("dossier", dossierId, node.x + 280, node.y, data);
      setNodes((prev) => [...prev, created]);
      setEdges((prev) => [...prev, { id: `e-${created.id}`, source: node.id, target: created.id, label: "not", kind: "relation" }]);
      openInspector(created.id);
      return;
    }
    if (id === "hearing.calendar" && node) {
      await apiRequest("POST", "/api/studio/approvals", {
        effect: "write",
        title: "Duruşmayı takvime yaz",
        content: node.title,
        diff: "Duruşma onaydan sonra takvim kaydı sayılır.",
      });
      await refreshApprovals();
      setChip(node.id, { status: "running", message: "Onay bekleniyor" });
      return;
    }
    if (id === "presentation.brief") {
      const matter = node?.type === "matter" ? node : nodes.find((item) => item.type === "matter");
      if (matter) beginChip(matter.id, id, "Sunum özeti");
      const res = await apiRequest("POST", "/api/studio/presentation-brief", {
        graph: { nodes, edges },
        matterId: matter?.id,
      });
      const data = await res.json();
      if (matter) setChip(matter.id, { status: "done", message: data.brief?.matter || "Özet hazır" });
      return;
    }
    if (id === "dossier.parse" && node) {
      const record = nodeDataRecord(node);
      const content = String(record.description || node.title || "");
      const epoch = beginChip(node.id, id, "Metin");
      try {
        const res = await apiRequest("POST", "/api/studio/parse-legal-doc", { content, filename: `${node.title}.udf` });
        const data = await res.json();
        if (!chipAlive(node.id, epoch)) return;
        const next = {
          ...record,
          description: data.document?.bodyText || content,
          checksum: data.document?.metadata?.checksum || record.checksum,
        } as NodeData;
        setNodes((prev) => prev.map((item) => (item.id === node.id ? syncNodeIdentity({ ...item, data: next } as StudioNode) : item)));
        setChip(node.id, { status: "done", message: data.document?.formatLabel || "Okundu" });
      } catch (error: any) {
        if (chipAlive(node.id, epoch)) setChip(node.id, { status: "error", message: error?.message || "Açılamadı" });
      }
      return;
    }
    if (id === "citation.check" && node) {
      const text = String(nodeDataRecord(node).description || node.title);
      beginChip(node.id, id, "Atıf");
      const res = await apiRequest("POST", "/api/studio/citation-check", { text });
      const data = await res.json();
      setCitationGate(data);
      setDefenseDraft(text);
      setChip(node.id, { status: data.exportAllowed ? "done" : "error", message: data.exportAllowed ? "Doğrulandı" : "Dışa aktarma kapalı" });
    }
  };

  const handleRunAutomation = () => {
    void runStudioAction("workflow.run");
  };

  const retryRun = (nodeId: string) => {
    const actionId = retryAction.current[nodeId];
    if (actionId) void runStudioAction(actionId, nodeId);
  };

  const cancelRun = (nodeId: string) => {
    runEpoch.current[nodeId] = (runEpoch.current[nodeId] || 0) + 1;
    setChip(nodeId, { status: "done", message: "Durduruldu" });
    if (activeRunId.current) void apiRequest("POST", "/api/studio/workflow/stop", { runId: activeRunId.current });
  };

  // Universal Document Ingestion via Modal
  const handleParseDocument = async () => {
    if (!ingestContent.trim()) return;
    setIsParsing(true);
    try {
      const res = await apiRequest("POST", "/api/studio/parse-legal-doc", {
        content: ingestContent,
        filename: "pasted-court-record.xml",
      });
      const data = await res.json();
      setParsedDoc(data.document);
      toast({ title: "Universal Document Parsed", description: `Detected: ${data.document.formatLabel}` });
    } catch (e: any) {
      toast({ title: "Parsing Error", description: e.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSpawnDocNode = () => {
    if (!parsedDoc) return;
    const docNode = buildDossierFromParsed(parsedDoc, 350, 200, "Belge");
    setNodes((prev) => [...prev, docNode]);
    setIngestModalOpen(false);
    setParsedDoc(null);
    setIngestContent("");
    openInspector(docNode.id);
    toast({ title: "Tuvale eklendi", description: `${docNode.title} düğümü oluşturuldu.` });
  };

  // Selected Node Data
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const relatedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id,
    );
  }, [edges, selectedNode]);

  // Options for relation-reference fields (related_matter_id, watches_matter_id…)
  const refOptions = useCallback(
    (type: NodeType) =>
      nodes
        .filter((node) => node.type === type)
        .map((node) => {
          const record = nodeDataRecord(node);
          const id = record[NODE_ID_FIELD[node.type]];
          return {
            value: typeof id === "string" && id ? id : node.id,
            label: node.title,
          };
        }),
    [nodes],
  );

  useEffect(() => {
    if (!pendingInspectorOpenRef.current) return;
    const content = inspectorContentRef.current;
    const page = containerRef.current;
    if (!content || !page) return;
    pendingInspectorOpenRef.current = false;

    const width = Math.min(436, Math.max(220, page.clientWidth - 40));
    const windowEl = content.querySelector(".liquid-window") as HTMLElement | null;
    const target = windowEl ?? content;
    const scroll = target.querySelector(".liquid-scroll") as HTMLElement | null;
    const snapshot = {
      width: target.style.width,
      height: target.style.height,
      position: target.style.position,
      visibility: target.style.visibility,
    };
    const scrollSnapshot = scroll
      ? { height: scroll.style.height, flex: scroll.style.flex, overflow: scroll.style.overflow }
      : null;
    target.style.position = "absolute";
    target.style.visibility = "hidden";
    target.style.width = `${width}px`;
    target.style.height = "auto";
    if (scroll) {
      scroll.style.flex = "none";
      scroll.style.height = "auto";
      scroll.style.overflow = "visible";
    }
    const natural = target.scrollHeight;
    target.style.width = snapshot.width;
    target.style.height = snapshot.height;
    target.style.position = snapshot.position;
    target.style.visibility = snapshot.visibility;
    if (scroll && scrollSnapshot) {
      scroll.style.height = scrollSnapshot.height;
      scroll.style.flex = scrollSnapshot.flex;
      scroll.style.overflow = scrollSnapshot.overflow;
    }

    const openFrame = detailFrame(natural);
    setInspectorClipping(true);
    pendingInspectorPresentRef.current = true;
    setInspectorShell((current) => (current ? { ...current, open: false, openFrame } : current));
  }, [inspectorShell, detailFrame]);

  useEffect(() => {
    if (!pendingInspectorPresentRef.current || !inspectorShell || inspectorShell.open) return;
    const frame = requestAnimationFrame(() => {
      if (!pendingInspectorPresentRef.current) return;
      pendingInspectorPresentRef.current = false;
      setInspectorMotionLive(true);
      setInspectorShell((current) => (current ? { ...current, open: true } : current));
    });
    return () => cancelAnimationFrame(frame);
  }, [inspectorShell]);

  useEffect(() => {
    if (!isInspectorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isInspectorOpen, closeInspector]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none bg-background font-google-sans"
      style={{
        fontFamily: appleFont,
        color: apple.bodyOnDark,
        fontSynthesis: "none",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textRendering: "optimizeLegibility",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOverCanvas(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOverCanvas(false);
      }}
      onDrop={handleDropFilesOnCanvas}
    >
      {/* Hidden file input for graph JSON import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportJson}
        accept=".json"
        className="hidden"
      />

      <AnimatePresence>
        {isDragOverCanvas && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-4 z-50 rounded-[18px] flex flex-col items-center justify-center pointer-events-none"
            style={{
              backgroundColor: "rgba(29,29,31,0.92)",
              backdropFilter: "saturate(180%) blur(20px)",
              border: `1px solid ${apple.primaryOnDark}`,
            }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white mb-3"
              style={{ backgroundColor: apple.primary }}
            >
              <Upload className="w-5 h-5" />
            </div>
            <h2 className="text-[21px] font-semibold tracking-[0.231px]" style={{ color: apple.parchment }}>
              Evrak dava dosyasına eklenir
            </h2>
            <p className="text-[12px] mt-1.5 font-normal tracking-[-0.12px]" style={{ color: apple.inkMuted48 }}>
              UDF · Akoma Ntoso · XJustiz · PACER · ECF · PDF/A
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Spotlight-style search — icon expands to field */}
      <div
        className="absolute top-4 left-4 z-40 flex flex-col gap-2 pointer-events-auto font-google-sans"
        style={{ fontFamily: appleFont }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ width: searchBarWidth }}
            transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.75 }}
            className="h-11 rounded-full flex items-center overflow-hidden origin-left"
            style={{
              paddingLeft: searchOpen ? 12 : 0,
              paddingRight: searchOpen ? 6 : 0,
              justifyContent: searchOpen ? "flex-start" : "center",
              gap: searchOpen ? 6 : 0,
              backgroundColor: apple.chrome,
              backdropFilter: "saturate(180%) blur(20px)",
              border: `1px solid ${apple.hairline}`,
              fontFamily: appleFont,
            }}
          >
            {!searchOpen ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setSearchOpen(true)}
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{ color: apple.parchment }}
                aria-label="Search"
              >
                <Search className="w-[17px] h-[17px]" strokeWidth={2.25} />
              </motion.button>
            ) : (
              <>
                <Search
                  className="w-[15px] h-[15px] shrink-0"
                  strokeWidth={2.25}
                  style={{ color: "rgba(235,235,245,0.45)" }}
                />
                <input
                  ref={searchInputRef}
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchSelectFirst();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      handleSearchCancel();
                    }
                  }}
                  placeholder="Search"
                  className="flex-1 min-w-0 h-9 bg-transparent border-0 outline-none text-[17px] font-normal tracking-[-0.374px] placeholder:text-[rgba(235,235,245,0.45)]"
                  style={{
                    color: apple.parchment,
                    fontFamily: appleFont,
                  }}
                />
                <AnimatePresence initial={false}>
                  {searchDraft.length > 0 && (
                    <motion.button
                      key="clear"
                      type="button"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 28 }}
                      whileTap={{ scale: 0.88 }}
                      onClick={() => {
                        setSearchDraft("");
                        searchInputRef.current?.focus();
                      }}
                      className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "rgba(142,142,147,0.55)", color: "#1c1c1e" }}
                      aria-label="Clear"
                    >
                      <X className="w-2.5 h-2.5" strokeWidth={3} />
                    </motion.button>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                  {searchResults.length > 0 && (
                    <motion.button
                      key="go"
                      type="button"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 28 }}
                      whileTap={{ scale: 0.88 }}
                      onClick={handleSearchSelectFirst}
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: apple.primaryFocus, color: "#fff" }}
                      aria-label="Go to first result"
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>

          <AnimatePresence>
            {searchOpen && (
              <motion.button
                key="cancel"
                type="button"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                whileTap={{ scale: 0.96, opacity: 0.7 }}
                onClick={handleSearchCancel}
                className="text-[17px] font-normal tracking-[-0.374px] px-1 shrink-0"
                style={{ color: apple.primaryOnDark, fontFamily: appleFont }}
              >
                Cancel
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {searchOpen && searchDraft.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, width: searchBarWidth }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.75 }}
              className="rounded-[14px] p-1.5 max-h-80 overflow-y-auto flex flex-col gap-0.5 origin-top-left"
              style={{
                backgroundColor: "rgba(28,28,30,0.94)",
                backdropFilter: "saturate(180%) blur(20px)",
                border: `1px solid ${apple.hairline}`,
                fontFamily: appleFont,
              }}
            >
              {searchResults.length === 0 ? (
                <div
                  className="px-3 py-4 text-[15px] text-center tracking-[-0.24px]"
                  style={{ color: apple.inkMuted48 }}
                >
                  No Results
                </div>
              ) : (
                searchResults.map((n) => {
                  const config = getNodeConfig(n.type);
                  const IconComponent = config.icon;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        handleFocusNode(n);
                        handleSearchCancel();
                      }}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-[11px] text-left active:scale-[0.98] transition-transform"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${config.dotColor}18`, color: config.dotColor }}
                        >
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <div
                            className="text-[15px] font-semibold truncate tracking-[-0.24px]"
                            style={{ color: apple.parchment }}
                          >
                            {n.title}
                          </div>
                          <div className="text-[12px] truncate" style={{ color: apple.inkMuted48 }}>
                            {config.label}
                            {n.subtitle || n.jurisdiction
                              ? ` · ${n.subtitle || n.jurisdiction}`
                              : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* NeoGraph utility bar */}
      <div className="absolute top-4 right-4 z-40 pointer-events-auto font-google-sans" style={{ fontFamily: appleFont }}>
        <div
          className="flex items-center h-10 pl-1.5 pr-1 gap-1.5"
          style={{
            backgroundColor: apple.chrome,
            backdropFilter: "saturate(180%) blur(20px)",
            border: `1px solid ${apple.hairline}`,
            borderRadius: 9999,
            fontFamily: appleFont,
          }}
        >
          {/* Zoom cluster: −  %  +  fit */}
          <div className="flex items-center gap-0">
            <button
              onClick={() => setZoom((z) => Math.max(0.25, z * 0.85))}
              title="Zoom Out"
              className="w-6 h-6 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: apple.parchment, fontFamily: appleFont }}
            >
              <Minus className="w-3 h-3" strokeWidth={2.25} />
            </button>
            <span
              className="min-w-[34px] text-center text-[11px] tabular-nums font-medium tracking-[-0.12px] px-0.5"
              style={{ color: apple.inkMuted48, fontFamily: appleFont }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
              title="Zoom In"
              className="w-6 h-6 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: apple.parchment, fontFamily: appleFont }}
            >
              <Plus className="w-3 h-3" strokeWidth={2.25} />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              title="Fit View"
              className="w-6 h-6 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: apple.bodyMuted, fontFamily: appleFont }}
            >
              <Scan className="w-3 h-3" strokeWidth={1.75} />
            </button>
          </div>

          <div className="h-3.5 w-px shrink-0 self-center" style={{ backgroundColor: apple.hairline }} />

          {/* File actions */}
          <div className="flex items-center gap-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import"
              className="w-6 h-6 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: apple.bodyMuted, fontFamily: appleFont }}
            >
              <ArrowUpFromLine className="w-3 h-3" strokeWidth={1.75} />
            </button>
            <button
              onClick={handleExportJson}
              title="Export"
              className="w-6 h-6 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: apple.bodyMuted, fontFamily: appleFont }}
            >
              <ArrowDownToLine className="w-3 h-3" strokeWidth={1.75} />
            </button>
            <button
              onClick={handleResetCanvas}
              title="Reset Canvas"
              className="w-6 h-6 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ color: apple.bodyMuted, fontFamily: appleFont }}
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
            </button>
          </div>

          <div className="h-3.5 w-px shrink-0 self-center" style={{ backgroundColor: apple.hairline }} />

          <button
            onClick={() => setAgenticCalendarOpen(true)}
            className="h-7 px-3 text-[12px] font-normal rounded-full active:scale-95 transition-transform shrink-0"
            style={{ color: apple.parchment, fontFamily: appleFont }}
          >
            Süre
          </button>
          <button
            onClick={handleRunAutomation}
            className="h-7 px-3 text-[12px] font-normal rounded-full active:scale-95 transition-transform shrink-0"
            style={{ color: apple.parchment, fontFamily: appleFont }}
          >
            Çalıştır
          </button>
          <button
            onClick={handleSaveCanvas}
            className="h-7 px-3 text-[12px] font-normal text-white rounded-full active:scale-95 transition-transform shrink-0"
            style={{ backgroundColor: apple.primary, fontFamily: appleFont }}
          >
            Kaydet
          </button>
        </div>
      </div>

      {/* Optimized NeoGraph canvas */}
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        selectedNodeId={selectedNodeId}
        pan={pan}
        zoom={zoom}
        onPanChange={setPan}
        onZoomChange={setZoom}
        onSelectNode={(id) => {
          setAllSelected(false);
          setSelectedNodeId(id);
        }}
        onNodeDoubleClick={(id) => {
          const node = nodes.find((item) => item.id === id);
          if (node?.type === "matter") {
            closeInspector();
            setExplorerMatterId(id);
            return;
          }
          openInspector(id);
        }}
        onNodePositionCommit={handleNodePositionCommit}
        onContextMenu={handleContextMenu}
        onSurfacePointerDown={() => contextMenu && setContextMenu(null)}
        runChips={runChips}
        onRetryRun={retryRun}
        onCancelRun={cancelRun}
        allSelected={allSelected}
        onConnectFlow={(sourceId, targetId, sourcePort, targetPort) => {
          setEdges((prev) => {
            if (prev.some((edge) => edge.source === sourceId && edge.target === targetId && edge.kind === "flow")) return prev;
            return [...prev, {
              id: `e-${Date.now()}`,
              source: sourceId,
              target: targetId,
              label: `${sourcePort}→${targetPort}`,
              kind: "flow" as const,
              sourcePort,
              targetPort,
              animated: false,
            }];
          });
        }}
      />

      {/* Empty canvas state — no seed data, so the first node is explicit */}
      {!isGraphLoading && nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-center">
            <p
              className="text-[13px] font-medium tracking-[0.005em]"
              style={{ color: "rgba(60,60,67,0.62)" }}
            >
              Tuval boş
            </p>
            <p
              className="mt-1 text-[12px] tracking-[0.005em]"
              style={{ color: "rgba(60,60,67,0.42)" }}
            >
              Sağ tıklayıp ilk düğümü ekleyin.
            </p>
          </div>
        </div>
      )}

      {/* Minimap — frameless, subtle radius */}
      <div
        className="absolute bottom-4 right-4 z-40 w-40 h-24 rounded-[6px] overflow-hidden cursor-crosshair pointer-events-auto"
        style={{
          backgroundColor: "rgba(29,29,31,0.55)",
          backdropFilter: "saturate(180%) blur(16px)",
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickRelX = (e.clientX - rect.left) / rect.width;
          const clickRelY = (e.clientY - rect.top) / rect.height;
          const targetX = minimapBounds.minX + clickRelX * minimapBounds.widthSpan;
          const targetY = minimapBounds.minY + clickRelY * minimapBounds.heightSpan;
          if (containerRef.current) {
            const cRect = containerRef.current.getBoundingClientRect();
            setPan({
              x: cRect.width / 2 - targetX * zoom,
              y: cRect.height / 2 - targetY * zoom,
            });
          }
        }}
      >
        {nodes.map((n) => {
          const px = ((n.x - minimapBounds.minX) / minimapBounds.widthSpan) * 100;
          const py = ((n.y - minimapBounds.minY) / minimapBounds.heightSpan) * 100;
          const isSelected = selectedNodeId === n.id;
          return (
            <div
              key={n.id}
              className="absolute rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${px}%`,
                top: `${py}%`,
                width: isSelected ? 10 : 6,
                height: isSelected ? 10 : 6,
                backgroundColor: isSelected ? apple.primaryOnDark : "rgba(255,255,255,0.7)",
              }}
            />
          );
        })}
      </div>

      {/* ======================================================== */}
      {explorerMatterId && nodes.some((node) => node.id === explorerMatterId) && (() => {
        const matter = nodes.find((node) => node.id === explorerMatterId)!;
        const data = nodeDataRecord(matter);
        return (
          <CaseFileExplorer
            title={matter.title || "Dava"}
            folders={Array.isArray(data.case_folders) ? (data.case_folders as CaseFolderRecord[]) : []}
            files={Array.isArray(data.case_files) ? (data.case_files as CaseFileRecord[]) : []}
            notes={Array.isArray(data.case_notes) ? (data.case_notes as CaseNoteRecord[]) : []}
            clients={Array.isArray(data.case_clients) ? (data.case_clients as CaseClientRecord[]) : []}
            precedents={Array.isArray(data.case_precedents) ? (data.case_precedents as CasePrecedentRecord[]) : []}
            facts={{
              docket: String(data.docket_number || ""),
              court: String(data.court || ""),
              jurisdiction: String(data.jurisdiction_code || ""),
              procedure: String(data.procedure_family || ""),
              status: String(data.status || ""),
              filed: String(data.date_filed || ""),
            }}
            pickToken={filePickToken}
            onClose={() => setExplorerMatterId(null)}
            onAddFiles={(list, folder) => {
              void addCaseFiles(explorerMatterId, list, folder);
            }}
            onPatch={(patch) => {
              setNodes((prev) =>
                prev.map((node) => {
                  if (node.id !== explorerMatterId || node.type !== "matter") return node;
                  return syncNodeIdentity({
                    ...node,
                    data: { ...nodeDataRecord(node), ...patch },
                  } as StudioNode);
                }),
              );
            }}
          />
        );
      })()}

      {contextMenu && (!contextMenu.targetNodeId || nodes.some((node) => node.id === contextMenu.targetNodeId)) && (
        <StudioContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.targetNodeId
              ? getNodeMenu(nodes.find((node) => node.id === contextMenu.targetNodeId)!)
              : getCanvasMenu()
          }
          onClose={() => setContextMenu(null)}
          onRun={(actionId) => {
            void runStudioAction(actionId);
          }}
        />
      )}

      {/* 6. NODE CREATION MODAL (Apple Sheet Style)               */}
      {/* ======================================================== */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent
          className="max-w-md rounded-[18px] p-6 border-0 font-google-sans"
          style={{ backgroundColor: apple.tile1, color: apple.parchment, fontFamily: appleFont }}
        >
          <DialogHeader>
            <DialogTitle className="text-[21px] font-semibold tracking-[0.231px]">
              Yeni {getNodeConfig(createType).label}
            </DialogTitle>
            <DialogDescription className="text-[14px] font-normal tracking-[-0.224px]" style={{ color: apple.inkMuted48 }}>
              Canvas üzerinde yeni bir {getNodeConfig(createType).label} düğümü oluştur.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-3">
            {CREATE_FIELD_KEYS[createType].map((key) => {
              const field = NODE_FIELDS[createType].find((entry) => entry.key === key);
              if (!field) return null;
              const defaults = createNodeData(createType, "") as Record<string, any>;
              return (
                <div key={field.key}>
                  <label className="text-[12px] font-semibold mb-1.5 block tracking-[-0.12px]" style={{ color: apple.bodyMuted }}>
                    {field.label}
                  </label>
                  <FieldInput
                    field={field}
                    value={createDraft[field.key] ?? defaults[field.key]}
                    record={{ ...defaults, ...createDraft }}
                    onChange={(value) => {
                      setCreateDraft((prev) => {
                        const next = { ...prev, [field.key]: value };
                        if (field.key === "jurisdiction_code") {
                          const courts = courtsFor(String(value));
                          const families = familiesFor(String(value));
                          next.court_id = courts[0]?.id || "";
                          next.court = courts[0]?.labelTr || "";
                          next.procedure_family = families[0] || "";
                        }
                        if (field.key === "court_id") {
                          const court = courtsFor(String(next.jurisdiction_code || defaults.jurisdiction_code || "TR")).find(
                            (item) => item.id === value,
                          );
                          if (court) next.court = court.labelTr;
                        }
                        return next;
                      });
                    }}
                    refOptions={refOptions}
                    variant="form"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="px-[22px] py-[11px] text-[14px] font-normal rounded-full active:scale-95 transition-transform"
              style={{ color: apple.inkMuted48 }}
            >
              Vazgeç
            </button>
            <button
              onClick={() => handleCreateNode(createType)}
              className="px-[22px] py-[11px] text-[14px] font-normal text-white rounded-full active:scale-95 transition-transform"
              style={{ backgroundColor: apple.primary }}
            >
              Düğüm ekle
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* 7. UNIVERSAL DOCUMENT INGESTION MODAL (Apple Style)      */}
      {/* ======================================================== */}
      <Dialog open={ingestModalOpen} onOpenChange={setIngestModalOpen}>
        <DialogContent
          className="max-w-xl rounded-[18px] p-6 border-0 font-google-sans"
          style={{ backgroundColor: apple.tile1, color: apple.parchment, fontFamily: appleFont }}
        >
          <DialogHeader>
            <DialogTitle className="text-[21px] font-semibold tracking-[0.231px] flex items-center gap-2">
              <Upload className="w-4 h-4" style={{ color: apple.primaryOnDark }} />
              Document Ingest
            </DialogTitle>
            <DialogDescription className="text-[14px] font-normal tracking-[-0.224px]" style={{ color: apple.inkMuted48 }}>
              UDF · LegalDocML · XJustiz · PACER · ECF · PDF/A
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <Textarea
              value={ingestContent}
              onChange={(e) => setIngestContent(e.target.value)}
              placeholder="Paste raw XML (UDF, Akoma Ntoso, XJustiz) or JSON (PACER docket) or plain legal text..."
              className="bg-[#18191c] border-white/[0.1] rounded-[10px] text-white font-mono text-[11px] h-36 resize-none p-3 focus:border-[#2997ff]"
            />

            <button
              onClick={handleParseDocument}
              disabled={isParsing || !ingestContent.trim()}
              className="h-11 text-white text-[14px] font-normal rounded-full active:scale-95 disabled:opacity-40 transition-transform"
              style={{ backgroundColor: apple.primary }}
            >
              {isParsing ? "Analyzing…" : "Ingest & Extract"}
            </button>

            {parsedDoc && (
              <div className="p-3 bg-[#18191c] border border-white/[0.08] rounded-[10px] flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[#30d158] border-[#30d158]/30 bg-[#30d158]/10 rounded-full px-2 py-0.5 text-[10px]">
                    {parsedDoc.formatLabel}
                  </Badge>
                  <span className="text-[11px] text-[#86868b]">{parsedDoc.jurisdiction}</span>
                </div>
                <div className="font-semibold text-white text-[13px] tracking-[-0.2px]">{parsedDoc.title}</div>
                <div className="text-[11px] text-[#86868b] line-clamp-2">{parsedDoc.summary}</div>
                <button
                  onClick={handleSpawnDocNode}
                  className="mt-1 h-7 bg-[#0066cc] hover:bg-[#0071e3] text-white font-normal rounded-full text-[12px] active:scale-95 transition-all"
                >
                  Pin Ingested Dossier to Graph
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* 8. AGENTIC CALENDAR MODAL (Apple Style)                  */}
      {/* ======================================================== */}
      <Dialog open={agenticCalendarOpen} onOpenChange={setAgenticCalendarOpen}>
        <DialogContent
          className="max-w-lg rounded-[18px] p-6 border-0 font-google-sans"
          style={{ backgroundColor: apple.tile1, color: apple.parchment, fontFamily: appleFont }}
        >
          <DialogHeader>
            <DialogTitle className="text-[21px] font-semibold tracking-[0.231px] flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: apple.primaryOnDark }} />
              Jurisdiction Calendar
            </DialogTitle>
            <DialogDescription className="text-[14px] font-normal tracking-[-0.224px]" style={{ color: apple.inkMuted48 }}>
              Statutory deadlines, weekend adjustments, and judicial recess rules.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#86868b] font-semibold mb-1 block text-[11px] tracking-[-0.12px]">Jurisdiction</label>
                <GlassSelect
                  value={agenticJurisdiction}
                  onChange={setAgenticJurisdiction}
                  ariaLabel="Jurisdiction"
                  className="!h-9 !rounded-[8px] !px-2.5 !text-[12px] !font-normal !bg-[#18191c] !shadow-none !border !border-white/10"
                  options={[
                    { value: "Türkiye", label: "Türkiye (HMK, İYUK, CMK, İİK)" },
                    { value: "Universal Arbitration", label: "Universal Arbitration (ICC / UNCITRAL)" },
                    { value: "US Federal (FRCP)", label: "US Federal (FRCP)" },
                    { value: "UK Civil Procedure (CPR)", label: "UK Civil Procedure (CPR)" },
                    { value: "Turkey / UYAP (HMK / CMK)", label: "Turkey / UYAP (HMK / CMK)" },
                    { value: "European Civil Law (ZPO)", label: "European Civil Law (ZPO - Germany)" },
                    { value: "France (CPC)", label: "France (Code de Procédure Civile)" },
                  ]}
                />
              </div>

              <div>
                <label className="text-[#86868b] font-semibold mb-1 block text-[11px] tracking-[-0.12px]">Service Date</label>
                <Input
                  type="date"
                  value={agenticTriggerDate}
                  onChange={(e) => setAgenticTriggerDate(e.target.value)}
                  className="bg-[#18191c] border-white/[0.1] text-white text-[12px] h-9 rounded-[8px] px-2.5"
                />
              </div>
            </div>

            <button
              onClick={handleComputeDeadlines}
              className="h-11 text-white text-[14px] font-normal rounded-full active:scale-95 transition-transform mt-1"
              style={{ backgroundColor: apple.primary }}
            >
              Run Calculation
            </button>

            {computedDeadlines.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2 max-h-56 overflow-y-auto">
                {computedDeadlines.map((dl, i) => (
                  <div key={i} className="p-2.5 bg-[#18191c] border border-white/[0.08] rounded-[10px] flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-[12px]">{dl.title}</span>
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2 py-0.5 text-[9px] font-normal ${
                          dl.urgency === "critical"
                            ? "text-[#ff453a] border-[#ff453a]/30 bg-[#ff453a]/10"
                            : "text-[#f5a623] border-[#f5a623]/30 bg-[#f5a623]/10"
                        }`}
                      >
                        {dl.dueDate} ({dl.daysCount}d)
                      </Badge>
                    </div>
                    <div className="text-[10px] text-[#86868b] font-mono">{dl.ruleCitation}</div>
                    <div className="text-[11px] text-white/70">{dl.description}</div>
                  </div>
                ))}

                <button
                  onClick={handleSpawnDeadlineNodes}
                  className="h-7 bg-[#0066cc] hover:bg-[#0071e3] text-white text-[12px] font-normal rounded-full active:scale-95 transition-all mt-1"
                >
                  Onay iste
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {(approvals.length > 0 || defenseDraft) && (
        <div
          className="absolute bottom-4 left-4 z-30 w-[320px] rounded-[14px] p-3 flex flex-col gap-2"
          style={{
            backgroundColor: "rgba(29,29,31,0.88)",
            border: `1px solid ${apple.hairline}`,
            color: apple.parchment,
            fontFamily: appleFont,
          }}
        >
          {approvals.map((card) => (
            <div key={card.id} className="flex flex-col gap-1 text-[12px]">
              <div className="font-medium">{card.effect} onayı</div>
              <div style={{ color: apple.inkMuted48 }}>{card.payload?.recipient}</div>
              <div className="whitespace-pre-wrap">{card.payload?.content}</div>
              <div style={{ color: apple.inkMuted48 }}>{card.payload?.attachment}</div>
              <div>{card.payload?.diff}</div>
              <div className="flex gap-2">
                <button onClick={() => decideCard(card.id, "approved")} className="h-7 px-3 rounded-full text-white" style={{ backgroundColor: apple.primary }}>Onayla</button>
                <button onClick={() => decideCard(card.id, "rejected")} className="h-7 px-3 rounded-full" style={{ color: apple.danger }}>Reddet</button>
              </div>
            </div>
          ))}
          {defenseDraft && (
            <div className="text-[12px] max-h-40 overflow-y-auto whitespace-pre-wrap">
              {defenseDraft}
              {citationGate && (
                <div className="mt-2" style={{ color: citationGate.exportAllowed ? apple.success : apple.danger }}>
                  {citationGate.exportAllowed ? "Atıflar doğrulandı" : "Dışa aktarma kapalı"}
                  {citationGate.items.map((item) => ` · ${item.raw} ${item.status}`).join("")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={advancedNodeId !== null} onOpenChange={(open) => !open && setAdvancedNodeId(null)}>
        <DialogContent className="max-w-md rounded-[18px] border-0" style={{ backgroundColor: apple.tile1, color: apple.parchment }}>
          <DialogHeader>
            <DialogTitle>Gelişmiş emsal araması</DialogTitle>
            <DialogDescription style={{ color: apple.inkMuted48 }}>Sorgu seçili düğümden gelir. Mahkeme Danıştay’dır.</DialogDescription>
          </DialogHeader>
          <Textarea value={precedentQuery} onChange={(event) => setPrecedentQuery(event.target.value)} className="min-h-24" />
          <button
            type="button"
            className="h-8 rounded-full px-3 text-[13px] text-white"
            style={{ backgroundColor: apple.primary }}
            onClick={() => {
              const target = nodes.find((item) => item.id === advancedNodeId);
              const query = precedentQuery;
              setAdvancedNodeId(null);
              if (target) void runPrecedent(target, ["danistay"], query, "precedent.advanced");
            }}
          >
            Danıştay’da ara
          </button>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* 9. DOSSIER INSPECTOR — LIQUID GLASS WINDOW               */}
      {/* ======================================================== */}
      {inspectorShell && selectedNode && (
          <motion.div
            ref={inspectorShellRef}
            initial={false}
            animate={{
              left: inspectorShell.openFrame.left,
              top: inspectorShell.openFrame.top,
              width: inspectorShell.openFrame.width,
              height: inspectorShell.openFrame.height,
              borderRadius: inspectorShell.openFrame.radius,
              opacity: inspectorShell.open ? 1 : 0,
              scale: inspectorShell.open ? 1 : 0.9,
            }}
            transition={
              inspectorDragging || !inspectorMotionLive
                ? { duration: 0 }
                : {
                    left: { duration: 0 },
                    top: { duration: 0 },
                    width: { duration: 0 },
                    height: { duration: 0 },
                    borderRadius: { duration: 0 },
                    opacity: IOS_SPRING,
                    scale: IOS_SPRING,
                  }
            }
            onUpdate={(latest) => {
              const opacity = typeof latest.opacity === "number" ? latest.opacity : 1;
              const current = inspectorShellStateRef.current;
              if (!current) return;
              if (!inspectorOpenRef.current) {
                if (opacity < 0.05) setInspectorShell(null);
                return;
              }
              if (!current.open || opacity < 0.98 || inspectorSettledRef.current) return;
              inspectorSettledRef.current = true;
              setInspectorClipping(false);
              if (!inspectorBodyReadyRef.current) {
                inspectorBodyReadyRef.current = true;
                startTransition(() => {
                  if (inspectorBodyReadyRef.current) setInspectorBodyReady(true);
                });
              }
            }}
            style={{ transformOrigin: "center" }}
            className={`absolute z-40 border border-white/[0.10] bg-[#16171b] ${
              inspectorClipping || !inspectorShell.open ? "overflow-hidden" : "overflow-visible"
            } ${inspectorShell.open ? "pointer-events-auto" : "pointer-events-none"}`}
          >
            <div className="h-full w-full">
              <div ref={inspectorContentRef} className="h-full w-full">
            <LiquidGlassWindow
              radius={14}
              blur={34}
              refraction={20}
              bezel={36}
              ambient={getNodeConfig(selectedNode.type).dotColor}
              className="h-full w-full max-h-full"
              style={{ fontFamily: appleFont }}
            >
              <div
                className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
                onPointerDown={beginInspectorDrag}
                onPointerMove={moveInspectorDrag}
                onPointerUp={endInspectorDrag}
                onPointerCancel={endInspectorDrag}
              >
              {/* Window titlebar */}
              <div className="liquid-titlebar">
                <motion.button
                  type="button"
                  aria-label="Kapat"
                  title="Kapat"
                  onClick={closeInspector}
                  whileTap={{ scale: 0.9 }}
                  className="liquid-close ml-auto cursor-pointer"
                >
                  <X strokeWidth={2.4} />
                </motion.button>
              </div>

                  {/* Identity */}
                  <div className="relative shrink-0 px-4 pt-1 pb-3.5">
                      <motion.div
                        key={selectedNode.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={IOS_SPRING}
                        className="flex items-start gap-3"
                      >
                    <div className="relative shrink-0">
                      <input
                        ref={nodeImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleNodeImageChange}
                      />
                      <button
                        type="button"
                        onClick={() => nodeImageInputRef.current?.click()}
                        title={selectedNode.image ? "Görseli değiştir" : "Görsel ata"}
                        aria-label={selectedNode.image ? "Görseli değiştir" : "Görsel ata"}
                        className="group/node-image relative flex h-[42px] w-[42px] cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.045] text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/60"
                      >
                        {selectedNode.image ? (
                          <>
                            <img
                              src={selectedNode.image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 bg-black/0 transition-colors group-hover/node-image:bg-black/35" />
                          </>
                        ) : (
                          <ImageOff className="h-[18px] w-[18px]" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                          style={{ color: "rgba(235,235,245,0.6)" }}
                        >
                          {getNodeConfig(selectedNode.type).label}
                        </span>
                        {selectedNode.status && (
                          <>
                            <span className="text-[10px]" style={{ color: "rgba(235,235,245,0.34)" }}>
                              /
                            </span>
                            <span className="text-[11px] font-medium truncate" style={{ color: apple.primaryOnDark }}>
                              {selectedNode.status}
                            </span>
                          </>
                        )}
                      </div>
                      <CopyText
                        text={selectedNode.title}
                        className="w-full"
                        textClassName="line-clamp-2 text-[17.5px] font-semibold leading-[1.22] tracking-[-0.2px] text-white"
                        style={{ textShadow: "0 1px 1px rgba(0,0,0,.2)" }}
                      />
                      {(selectedNode.subtitle || selectedNode.jurisdiction) && (
                        <CopyText
                          text={selectedNode.subtitle || selectedNode.jurisdiction || ""}
                          className="mt-1 w-full text-[12.5px] leading-[1.45] tracking-[0.005em]"
                          textClassName="truncate"
                          style={{ color: "rgba(235,235,245,0.66)" }}
                        />
                      )}
                    </div>
                      </motion.div>
                  </div>
              </div>

                  {/* macOS segmented control */}
                  <div className="px-4 pb-3 shrink-0">
                    <div className="liquid-segment">
                      {[
                        { id: "overview", label: "Genel" },
                        { id: "edit", label: "Düzenle" },
                        { id: "relations", label: "Bağlantı" },
                        { id: "vault", label: "Vault" },
                      ].map((tab) => (
                        <motion.button
                          key={tab.id}
                          type="button"
                          onClick={() => setInspectorTab(tab.id as any)}
                          whileTap={{ scale: 0.96 }}
                          className="relative h-[26px] rounded-[9px] text-[12px] tracking-[0.005em] transition-colors duration-150 select-none"
                          style={{
                            color:
                              inspectorTab === tab.id
                                ? "rgba(255,255,255,0.98)"
                                : "rgba(235,235,245,0.62)",
                            fontWeight: inspectorTab === tab.id ? 600 : 500,
                          }}
                        >
                          {inspectorTab === tab.id && (
                            <motion.div
                              layoutId="liquid-inspector-tab"
                              className="liquid-segment-thumb absolute inset-0"
                              transition={IOS_SPRING}
                            />
                          )}
                          <span className="relative z-10">{tab.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable content */}
                  <div className="liquid-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2.5 select-text">
                    {inspectorBodyReady ? (
                    <div className="inspector-reveal">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={`${selectedNode.id}-${inspectorTab}`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={IOS_SPRING}
                      >
                        {inspectorTab === "overview" && (
                          <NodeOverview node={selectedNode} refOptions={refOptions} />
                        )}

                        {inspectorTab === "relations" && (
                          <div className="flex flex-col gap-4 pt-1">
                            <section>
                              <div className="liquid-section-label">
                                <span>Yeni bağlantı</span>
                              </div>
                              <div className="liquid-group p-3 flex flex-col gap-2">
                                <GlassSelect
                                  value={linkTargetId}
                                  onChange={setLinkTargetId}
                                  placeholder="Hedef düğüm seçin…"
                                  ariaLabel="Hedef düğüm"
                                  options={nodes
                                    .filter((n) => n.id !== selectedNode.id)
                                    .map((n) => ({
                                      value: n.id,
                                      label: n.title,
                                      hint: getNodeConfig(n.type).label,
                                    }))}
                                />

                                <input
                                  value={linkLabel}
                                  onChange={(e) => setLinkLabel(e.target.value)}
                                  placeholder="İlişki etiketi (örn. Vekil, Taraf, Delil)…"
                                  className="liquid-input"
                                />

                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {["Vekil", "Duruşma", "Delil", "Taraf", "İtiraz", "Bilirkişi"].map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => setLinkLabel(tag)}
                                      className={`liquid-chip ${
                                        linkLabel === tag ? "liquid-chip-active" : ""
                                      }`}
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>

                                <button
                                  type="button"
                                  disabled={!linkTargetId}
                                  onClick={() => handleCreateEdge(linkTargetId, linkLabel)}
                                  className="liquid-primary mt-0.5 w-full"
                                >
                                  <Link2 className="w-3.5 h-3.5" /> Bağlantı Kur
                                </button>
                              </div>
                            </section>

                            <section>
                              <div className="liquid-section-label">
                                <span>Bağlantılar</span>
                                <span className="font-mono text-[10px] normal-case tracking-[0.01em] text-white/50">
                                  {relatedEdges.length}
                                </span>
                              </div>
                              <div className="liquid-group">
                                {relatedEdges.map((e) => {
                                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                                  const otherNode = nodeMap.get(otherId);

                                  return (
                                    <div
                                      key={e.id}
                                      className="liquid-row group/row !gap-2 !py-2 hover:bg-white/[0.03] transition-colors"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div className="min-w-0 flex-1">
                                          <button
                                            type="button"
                                            onClick={() => setSelectedNodeId(otherId)}
                                            className="block max-w-full text-left"
                                          >
                                            <span
                                              className="block text-[13px] truncate font-medium tracking-[0.005em] leading-[1.3] transition-colors"
                                              style={{ color: "rgba(255,255,255,0.94)" }}
                                            >
                                              {otherNode?.title || otherId}
                                            </span>
                                          </button>
                                          <input
                                            value={e.label || ""}
                                            onChange={(event) =>
                                              handleUpdateEdgeLabel(e.id, event.target.value)
                                            }
                                            placeholder="İlişki etiketi"
                                            aria-label="İlişki etiketi"
                                            className="mt-0.5 w-full border-0 bg-transparent p-0 text-[11px] tracking-[0.005em] outline-none placeholder:text-white/25"
                                            style={{ color: "rgba(235,235,245,0.58)" }}
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedNodeId(otherId)}
                                          title="Düğüme git"
                                          className="shrink-0 p-0.5"
                                        >
                                          <ChevronRight
                                            className="w-3.5 h-3.5 shrink-0"
                                            style={{ color: "rgba(235,235,245,0.24)" }}
                                          />
                                        </button>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEdge(e.id)}
                                        title="Bağlantıyı Kaldır"
                                        className="p-1 rounded-[6px] opacity-0 group-hover/row:opacity-100 hover:bg-white/[0.07] active:scale-95 transition-all shrink-0"
                                        style={{ color: "rgba(255,69,58,0.85)" }}
                                      >
                                        <Unlink className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })}

                                {relatedEdges.length === 0 && (
                                  <div className="flex flex-col items-center justify-center gap-2 py-7 text-center">
                                    <div
                                      className="w-9 h-9 rounded-[10px] flex items-center justify-center"
                                      style={{
                                        background: "rgba(255,255,255,.045)",
                                        boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.07)",
                                      }}
                                    >
                                      <Unlink
                                        className="w-4 h-4"
                                        style={{ color: "rgba(235,235,245,0.35)" }}
                                      />
                                    </div>
                                    <div
                                      className="text-[12px] tracking-[0.005em]"
                                      style={{ color: "rgba(235,235,245,0.58)" }}
                                    >
                                      Aktif bağlantı bulunmuyor
                                    </div>
                                  </div>
                                )}
                              </div>
                            </section>
                          </div>
                        )}

                        {inspectorTab === "edit" && (
                          <NodeEdit
                            node={selectedNode}
                            draft={editDraft}
                            onChange={(key, value) =>
                              setEditDraft((prev) => ({ ...prev, [key]: value }))
                            }
                            onRemoveKey={handleRemoveDraftKey}
                            onSave={handleSaveNodeEdits}
                            refOptions={refOptions}
                          />
                        )}

                        {inspectorTab === "vault" && <NodeVault node={selectedNode} />}

                      </motion.div>
                    </AnimatePresence>
                    </div>
                    ) : (
                      <InspectorSkeleton />
                    )}
                  </div>

                  {/* Footer toolbar */}
                  <div className="shrink-0 px-4 pb-3.5 pt-0.5">
                    <div className="liquid-hairline mb-2.5" />
                    <div className="flex items-center justify-end gap-4">
                      <motion.button
                        type="button"
                        onClick={handleDuplicateSelectedNode}
                        title="Çoğalt"
                        whileTap={{ scale: 0.96 }}
                        className="liquid-link"
                      >
                        Çoğalt
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={handleCopyNodeJson}
                        title="JSON Kopyala"
                        whileTap={{ scale: 0.96 }}
                        className="liquid-link"
                      >
                        Kopyala
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => {
                          setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
                          setEdges((prev) =>
                            prev.filter(
                              (e) => e.source !== selectedNode.id && e.target !== selectedNode.id,
                            ),
                          );
                          setInspectorShell(null);
                          setIsInspectorOpen(false);
                          setSelectedNodeId(null);
                          toast({ title: "Düğüm Kaldırıldı", description: "Tuvalden silindi." });
                        }}
                        title="Düğümü Kaldır"
                        whileTap={{ scale: 0.96 }}
                        className="liquid-link liquid-link-danger"
                      >
                        Kaldır
                      </motion.button>
                    </div>
                  </div>
            </LiquidGlassWindow>
              </div>
            </div>
          </motion.div>
      )}
    </div>
  );
}
