import type { StudioEdge } from "./GraphCanvas";
import {
  buildStudioNode,
  createNodeData,
  newStudioNodeId,
  nodeDataRecord,
  type NodeData,
  type NodeType,
  type StudioNode,
} from "./types";

export interface PrecedentHit {
  title?: string;
  citation?: string;
  snippet?: string;
  relation?: string;
}

export function buildPrecedentQuery(node: StudioNode, nodes: StudioNode[], edges: StudioEdge[]): string {
  const data = nodeDataRecord(node);
  const parts = [node.title];
  if (node.type === "matter") {
    parts.push(String(data.docket_number || ""), String(data.court || ""), String(data.nature_of_suit || ""));
  }
  if (node.type === "dossier") {
    parts.push(String(data.exhibit_number || ""), String(data.description || "").slice(0, 180));
  }
  const neighborIds = new Set<string>();
  edges.forEach((edge) => {
    if (edge.source === node.id) neighborIds.add(edge.target);
    if (edge.target === node.id) neighborIds.add(edge.source);
  });
  nodes.forEach((other) => {
    if (!neighborIds.has(other.id)) return;
    if (other.type === "dossier" || other.type === "matter") parts.push(other.title);
  });
  return parts.map((part) => part.trim()).filter(Boolean).join(" ").slice(0, 400);
}

export function precedentNodes(hits: PrecedentHit[], origin: StudioNode): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const nodes = hits.map((hit, index) => {
    const id = newStudioNodeId("dossier");
    const data = {
      ...(createNodeData("dossier", id) as unknown as Record<string, unknown>),
      title: hit.title || "Emsal",
      document_type: "Precedent",
      exhibit_number: hit.citation || "",
      description: hit.snippet || "",
    } as NodeData;
    return {
      hit,
      node: buildStudioNode("dossier", id, origin.x + 280, origin.y + index * 120, data),
    };
  });
  return {
    nodes: nodes.map((item) => item.node),
    edges: nodes.map((item) => ({
      id: `e-${item.node.id}`,
      source: origin.id,
      target: item.node.id,
      label: item.hit.relation === "against" ? "against" : "supports",
      kind: "flow" as const,
    })),
  };
}

export function templateChain(
  origin: { x: number; y: number },
  steps: { type: NodeType; name: string; connector_id?: string; effect?: string }[],
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const nodes = steps.map((step, index) => {
    const id = newStudioNodeId(step.type);
    const data = {
      ...(createNodeData(step.type, id) as unknown as Record<string, unknown>),
      name: step.name,
      connector_id: step.connector_id || "",
      effect: step.effect || (step.type === "ai_step" ? "draft" : "read"),
      config_json: step.name,
    } as NodeData;
    return buildStudioNode(step.type, id, origin.x + index * 280, origin.y, data);
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `e-${node.id}`,
    source: nodes[index].id,
    target: node.id,
    label: "flow",
    kind: "flow" as const,
  }));
  return { nodes, edges };
}

export function flowSubgraph(startId: string, nodes: StudioNode[], edges: StudioEdge[]) {
  const seen = new Set<string>([startId]);
  let grew = true;
  const flow = edges.filter((edge) => edge.kind !== "relation");
  while (grew) {
    grew = false;
    flow.forEach((edge) => {
      if (seen.has(edge.source) && !seen.has(edge.target)) {
        seen.add(edge.target);
        grew = true;
      }
    });
  }
  return {
    nodes: nodes.filter((node) => seen.has(node.id)),
    edges: flow.filter((edge) => seen.has(edge.source) && seen.has(edge.target)),
  };
}
