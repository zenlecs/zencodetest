import crypto from "crypto";
import { client } from "../db";
import { encrypt, decrypt } from "../crypto";
import { zenVault } from "./zen-vault";
import { sha256 } from "./udf";

export type StepEffect = "read" | "draft" | "write" | "send" | "sign" | "delete";

const GATED: StepEffect[] = ["send", "sign", "delete"];
const USER_AGENT = "ZenlecsStudio/1.0 (hukuk arastirma; yerel masaustu)";

let tablesReady = false;

export async function ensureAutomationTables(): Promise<void> {
  if (tablesReady) return;
  await client.exec(`
    ALTER TABLE studio_graph_states ADD COLUMN IF NOT EXISTS undo_stack text;
    ALTER TABLE studio_graph_states ADD COLUMN IF NOT EXISTS matter_canvas_id text;
    CREATE TABLE IF NOT EXISTS workflows (
      id text PRIMARY KEY, user_id integer NOT NULL, name text NOT NULL,
      graph_json text NOT NULL, allow_write boolean DEFAULT false NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id text PRIMARY KEY, workflow_id text NOT NULL, user_id integer NOT NULL,
      status varchar(32) NOT NULL, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS run_steps (
      id text PRIMARY KEY, run_id text NOT NULL, node_id text NOT NULL,
      status varchar(32) NOT NULL, output_json text
    );
    CREATE TABLE IF NOT EXISTS connector_accounts (
      id text PRIMARY KEY, user_id integer NOT NULL, connector_id text NOT NULL,
      token_cipher text, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id text PRIMARY KEY, user_id integer NOT NULL, run_id text, effect varchar(16) NOT NULL,
      status varchar(16) NOT NULL, payload_json text NOT NULL, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id serial PRIMARY KEY, user_id integer NOT NULL, run_id text, connector_id text,
      tool text, params_summary text, result_summary text, approval_id text,
      prev_hash text NOT NULL, entry_hash text NOT NULL, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dossier_files (
      id text PRIMARY KEY, user_id integer NOT NULL, node_id text, filename text NOT NULL,
      checksum text NOT NULL, vault_blob_id text, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dossier_file_versions (
      id text PRIMARY KEY, file_id text NOT NULL, version integer NOT NULL,
      checksum text NOT NULL, vault_blob_id text, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matter_folders (
      id text PRIMARY KEY, user_id integer NOT NULL, matter_id text NOT NULL,
      parent_id text, name text NOT NULL, sort integer DEFAULT 0 NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matter_files (
      id text PRIMARY KEY, user_id integer NOT NULL, matter_id text NOT NULL,
      folder_id text, title text NOT NULL, mime text, sha256 text,
      vault_blob_id text, preview text, source text, created_at timestamp DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matter_notes (
      id text PRIMARY KEY, user_id integer NOT NULL, matter_id text NOT NULL,
      body text NOT NULL, created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  tablesReady = true;
}

export function maskPii(text: string, names: string[] = []): string {
  let out = text.replace(/\b\d{11}\b/g, "[TCKN]");
  out = out.replace(/\b\d{5}\b(?=\s+\S)/g, "[PK]");
  for (const name of names) {
    const clean = name.trim();
    if (clean.length < 3) continue;
    out = out.split(clean).join("[İSİM]");
  }
  return out;
}

export function sealGraph(raw: string): string {
  if (raw.startsWith("zv1:")) return raw;
  return `zv1:${encrypt(raw)}`;
}

export function openGraph(stored: string): { text: string; migrated: boolean } {
  if (!stored.startsWith("zv1:")) return { text: stored, migrated: true };
  return { text: decrypt(stored.slice(4)), migrated: false };
}

async function audit(entry: {
  userId: number;
  runId?: string;
  connectorId?: string;
  tool?: string;
  paramsSummary?: string;
  resultSummary?: string;
  approvalId?: string;
}): Promise<void> {
  await ensureAutomationTables();
  const prev = await client.query<{ entry_hash: string }>(
    "SELECT entry_hash FROM audit_log WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [entry.userId],
  );
  const prevHash = prev.rows[0]?.entry_hash || "genesis";
  const body = JSON.stringify({
    userId: entry.userId,
    runId: entry.runId || null,
    connectorId: entry.connectorId || null,
    tool: entry.tool || null,
    params: maskPii(entry.paramsSummary || ""),
    result: maskPii(entry.resultSummary || ""),
    approvalId: entry.approvalId || null,
    prevHash,
  });
  const entryHash = crypto.createHash("sha256").update(body).digest("hex");
  await client.query(
    `INSERT INTO audit_log (user_id, run_id, connector_id, tool, params_summary, result_summary, approval_id, prev_hash, entry_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      entry.userId,
      entry.runId || null,
      entry.connectorId || null,
      entry.tool || null,
      maskPii(entry.paramsSummary || ""),
      maskPii(entry.resultSummary || ""),
      entry.approvalId || null,
      prevHash,
      entryHash,
    ],
  );
}

export async function recordDossierFile(input: {
  userId: number;
  nodeId?: string;
  filename: string;
  bytes: Buffer;
  vaultBlobId?: string | null;
}): Promise<{ fileId: string; checksum: string; version: number }> {
  await ensureAutomationTables();
  const checksum = sha256(input.bytes);
  const fileId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await client.query(
    `INSERT INTO dossier_files (id, user_id, node_id, filename, checksum, vault_blob_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [fileId, input.userId, input.nodeId || null, input.filename, checksum, input.vaultBlobId || null],
  );
  await client.query(
    `INSERT INTO dossier_file_versions (id, file_id, version, checksum, vault_blob_id) VALUES ($1,$2,1,$3,$4)`,
    [versionId, fileId, checksum, input.vaultBlobId || null],
  );
  return { fileId, checksum, version: 1 };
}

export function tryVaultStore(bytes: Buffer, filename: string): string | null {
  try {
    return zenVault.encryptAndStore(bytes, { filename, source: "studio" });
  } catch {
    return null;
  }
}

const precedentCache = new Map<string, { at: number; hits: PrecedentHit[] }>();
let lastRemoteAt = 0;

export interface PrecedentHit {
  id: string;
  court: "danistay" | "uyap-emsal" | "aym";
  title: string;
  citation: string;
  snippet: string;
  url: string;
  relation: "supports" | "against";
}

async function politeFetch(url: string, init?: RequestInit): Promise<Response> {
  const wait = 1200 - (Date.now() - lastRemoteAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRemoteAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function relationFor(text: string): "supports" | "against" {
  const lower = text.toLocaleLowerCase("tr");
  if (lower.includes("boz") || lower.includes("iptal") || lower.includes("ret")) return "against";
  return "supports";
}

function hitsFromUnknown(court: PrecedentHit["court"], payload: unknown, query: string): PrecedentHit[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as any).data?.data || (payload as any).data || (payload as any).results || [])
      : [];
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map((item: any, index: number) => {
    const citation = String(item.esasNo || item.kararNo || item.id || item.decisionId || `${court}-${index + 1}`);
    const title = String(item.kararTuru || item.daire || item.title || item.esasNo || `${court} kararı`);
    const snippet = String(item.ozet || item.snippet || item.kararMetni || item.summary || "").slice(0, 400);
    const id = String(item.id || item.documentId || citation);
    return {
      id,
      court,
      title,
      citation,
      snippet,
      url: court === "danistay"
        ? `https://karararama.danistay.gov.tr/getDokuman?id=${encodeURIComponent(id)}`
        : "",
      relation: relationFor(`${title} ${snippet} ${query}`),
    };
  }).filter((hit) => hit.citation);
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${label} araması ${response.status} döndü.`);
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} yanıtı okunamadı.`);
  }
}

async function searchDanistay(query: string): Promise<PrecedentHit[]> {
  const response = await politeFetch("https://karararama.danistay.gov.tr/aramalist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { andKelimeler: [query], orKelimeler: [], notAndKelimeler: [], pageSize: 8, pageNumber: 1 },
    }),
  });
  const hits = hitsFromUnknown("danistay", await readJson(response, "Danıştay"), query);
  for (const hit of hits.slice(0, 3)) {
    const url = `https://karararama.danistay.gov.tr/getDokuman?id=${encodeURIComponent(hit.id)}&arananKelime=${encodeURIComponent(query)}`;
    hit.url = url;
    try {
      const doc = await politeFetch(url);
      if (!doc.ok) continue;
      const raw = await doc.text();
      const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (plain.startsWith("{")) {
        const json = JSON.parse(plain) as { data?: unknown; dokuman?: unknown };
        const text = String(json.dokuman || json.data || "");
        if (text) hit.snippet = text.replace(/<[^>]+>/g, " ").slice(0, 400);
      } else if (plain) {
        hit.snippet = plain.slice(0, 400);
      }
    } catch {
      // Liste sonucu durur; belge çağrısı aramayı düşürmez.
    }
  }
  return hits;
}

export async function searchPrecedents(query: string, court: PrecedentHit["court"] = "danistay"): Promise<PrecedentHit[]> {
  const key = `${court}:${query.trim().toLocaleLowerCase("tr")}`;
  const cached = precedentCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.hits;

  let hits: PrecedentHit[] = [];
  if (court === "danistay") {
    hits = await searchDanistay(query);
  } else if (court === "uyap-emsal") {
    const response = await politeFetch("https://emsal.uyap.gov.tr/aramalist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { andKelimeler: [query], pageSize: 8, pageNumber: 1 } }),
    });
    hits = hitsFromUnknown(court, await readJson(response, "UYAP Emsal"), query);
  } else {
    const response = await politeFetch("https://kararlarbilgibankasi.anayasa.gov.tr/api/decision/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: query, page: 1, pageSize: 8 }),
    });
    hits = hitsFromUnknown(court, await readJson(response, "AYM"), query);
  }
  precedentCache.set(key, { at: Date.now(), hits });
  return hits;
}

export const CONNECTORS = [
  { id: "danistay", name: "Danıştay karar arama", auth: "none", effect: "read" as const, dataClass: "public-case-law" },
  { id: "uyap-emsal", name: "UYAP Emsal", auth: "none", effect: "read" as const, dataClass: "public-case-law" },
  { id: "aym", name: "AYM karar bankası", auth: "none", effect: "read" as const, dataClass: "public-case-law" },
  { id: "gmail", name: "Gmail", auth: "oauth", effect: "read" as const, dataClass: "mailbox" },
  { id: "outlook", name: "Outlook", auth: "oauth", effect: "read" as const, dataClass: "mailbox" },
];

interface FlowNode {
  id: string;
  type: string;
  data?: Record<string, any>;
  title?: string;
}
interface FlowEdge {
  source: string;
  target: string;
  kind?: string;
  label?: string;
}

const stopped = new Set<string>();

export function stopRun(runId: string): void {
  stopped.add(runId);
}

function topo(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const incoming = new Map<string, number>();
  nodes.forEach((node) => incoming.set(node.id, 0));
  edges.forEach((edge) => incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1));
  const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0);
  const ordered: FlowNode[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  while (queue.length) {
    const current = queue.shift()!;
    ordered.push(current);
    edges.filter((edge) => edge.source === current.id).forEach((edge) => {
      const next = (incoming.get(edge.target) || 1) - 1;
      incoming.set(edge.target, next);
      if (next === 0) {
        const node = byId.get(edge.target);
        if (node) queue.push(node);
      }
    });
  }
  return ordered.length === nodes.length ? ordered : nodes;
}

async function queueApproval(userId: number, runId: string, effect: StepEffect, payload: Record<string, unknown>): Promise<string> {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO approvals (id, user_id, run_id, effect, status, payload_json) VALUES ($1,$2,$3,$4,'pending',$5)`,
    [id, userId, runId, effect, JSON.stringify(payload)],
  );
  await audit({
    userId,
    runId,
    tool: effect,
    paramsSummary: JSON.stringify({ recipient: payload.recipient || "", attachment: payload.attachment || "" }),
    resultSummary: "waiting",
    approvalId: id,
  });
  return id;
}

export async function runWorkflow(userId: number, graph: { nodes?: FlowNode[]; edges?: FlowEdge[] }, allowWrite = false) {
  await ensureAutomationTables();
  const automation = (graph.nodes || []).filter((node) =>
    ["trigger", "connector", "ai_step", "logic", "approval", "output"].includes(node.type),
  );
  const ids = new Set(automation.map((node) => node.id));
  const edges = (graph.edges || []).filter((edge) => ids.has(edge.source) && ids.has(edge.target) && edge.kind !== "relation");
  const runId = crypto.randomUUID();
  const workflowId = crypto.randomUUID();
  await client.query(
    `INSERT INTO workflows (id, user_id, name, graph_json, allow_write) VALUES ($1,$2,$3,$4,$5)`,
    [workflowId, userId, "Studio akışı", JSON.stringify({ nodes: automation, edges }), allowWrite],
  );
  await client.query(
    `INSERT INTO workflow_runs (id, workflow_id, user_id, status) VALUES ($1,$2,$3,'running')`,
    [runId, workflowId, userId],
  );

  const ordered = topo(automation, edges);
  const outputs: Record<string, unknown> = {};
  for (const node of ordered) {
    if (stopped.has(runId)) {
      await client.query(`UPDATE workflow_runs SET status = 'stopped' WHERE id = $1`, [runId]);
      return { runId, status: "stopped", outputs, approvals: [] as string[] };
    }
    const effect = (node.data?.effect || "read") as StepEffect;
    const connectorId = String(node.data?.connector_id || "");
    if (GATED.includes(effect) || node.type === "approval" || (effect === "write" && !allowWrite)) {
      const requested = (GATED.includes(effect) ? effect : effect) as StepEffect;
      const approvalId = await queueApproval(userId, runId, requested, {
        recipient: node.data?.recipient || "",
        content: node.data?.config_json || node.title || "",
        attachment: node.data?.attachment || "",
        diff: node.data?.diff || "",
        nodeId: node.id,
      });
      await client.query(
        `INSERT INTO run_steps (id, run_id, node_id, status, output_json) VALUES ($1,$2,$3,'waiting',$4)`,
        [crypto.randomUUID(), runId, node.id, JSON.stringify({ approvalId })],
      );
      await client.query(`UPDATE workflow_runs SET status = 'waiting' WHERE id = $1`, [runId]);
      return { runId, status: "waiting", approvalId, outputs };
    }
    let output: unknown = { ok: true };
    if (node.type === "connector" && ["danistay", "uyap-emsal", "aym"].includes(connectorId)) {
      const query = String(node.data?.config_json || node.title || "");
      const hits = await searchPrecedents(query, connectorId as PrecedentHit["court"]);
      output = { hits };
      await audit({ userId, runId, connectorId, tool: "search", paramsSummary: query.slice(0, 80), resultSummary: `${hits.length} karar` });
    } else if (node.type === "ai_step") {
      const inbound = edges.filter((edge) => edge.target === node.id).map((edge) => outputs[edge.source]);
      const hits = inbound.flatMap((item) => {
        const list = (item as { hits?: { title?: string; citation?: string; summary?: string }[] })?.hits;
        return Array.isArray(list) ? list : [];
      });
      const wantsDefense = /savunma|cevap|dilek/i.test(`${node.title || ""} ${node.data?.name || ""}`);
      if (wantsDefense) {
        const draft = buildDefenseDraft({
          matterTitle: String(node.title || "Dava"),
          parties: [],
          dossierNotes: hits.map((hit) => String(hit.summary || hit.title || "")).filter(Boolean),
          precedents: hits.map((hit) => ({
            citation: String(hit.citation || hit.title || ""),
            relation: "supports",
            snippet: String(hit.summary || ""),
          })),
        });
        output = { text: draft.text, draft: true, hits };
      } else {
        const ranked = hits.slice(0, 5).map((hit, index) => `${index + 1}. ${hit.citation || hit.title || "karar"}`);
        output = {
          text: ranked.length ? `Emsal sırası:\n${ranked.join("\n")}` : "Akış girdisi alındı. Sonuç üretmek için bir bağlantı adımı gerekir.",
          draft: true,
          hits,
        };
      }
    } else if (node.type === "output") {
      const inbound = edges.filter((edge) => edge.target === node.id).map((edge) => outputs[edge.source]);
      const text = inbound
        .map((item) => {
          const record = item as { text?: string };
          return record?.text || "";
        })
        .filter(Boolean)
        .join("\n\n");
      output = { title: node.title || "Çıktı", text, inbound };
    }
    outputs[node.id] = output;
    await client.query(
      `INSERT INTO run_steps (id, run_id, node_id, status, output_json) VALUES ($1,$2,$3,'done',$4)`,
      [crypto.randomUUID(), runId, node.id, JSON.stringify(output)],
    );
  }
  await client.query(`UPDATE workflow_runs SET status = 'done' WHERE id = $1`, [runId]);
  return { runId, status: "done", outputs };
}

export async function listApprovals(userId: number) {
  await ensureAutomationTables();
  const result = await client.query(
    `SELECT id, run_id, effect, status, payload_json, created_at FROM approvals WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    runId: row.run_id,
    effect: row.effect,
    status: row.status,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  }));
}

export async function decideApproval(userId: number, id: string, decision: "approved" | "rejected") {
  await ensureAutomationTables();
  const existing = await client.query<{ effect: string }>(
    `SELECT id, status, effect FROM approvals WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const row = existing.rows[0] as { effect?: string } | undefined;
  if (!row) return null;
  await client.query(`UPDATE approvals SET status = $1 WHERE id = $2 AND user_id = $3`, [decision, id, userId]);
  await audit({ userId, tool: String(row.effect || ""), resultSummary: decision, approvalId: id });
  return { id, status: decision };
}

const KNOWN_ARTICLES: Record<string, string> = {
  "hmk m. 127": "Cevap süresi iki haftadır.",
  "hmk m. 129": "Cevap dilekçesinde savunma sebepleri gösterilir.",
  "hmk m. 136": "Cevaba cevap süresi iki haftadır.",
  "hmk m. 345": "İstinaf süresi iki haftadır.",
  "hmk m. 361": "Temyiz süresi iki haftadır.",
  "hmk m. 104": "Adli tatile rastlayan süreler tatil bitiminden bir hafta uzar.",
  "hmk m. 439": "Hakem kararı tebliğinden itibaren bir ay içinde iptal davası açılır.",
  "iyuk m. 7": "İptal davası altmış gündür.",
  "iyuk m. 46": "İdari yargı temyizi otuz gündür.",
  "cmk m. 268": "İtiraz süresi yedi gündür.",
  "iik m. 16": "Şikayet süresi yedi gündür.",
};

export interface CitationBadge {
  raw: string;
  kind: "statute" | "decision";
  status: "verified" | "unverified" | "not_found";
  note: string;
}

function statuteKey(law: string, article: string): string {
  const folded = law.toLocaleLowerCase("tr").replace(/ı/g, "i");
  return `${folded} m. ${article}`;
}

export function checkCitations(text: string): { items: CitationBadge[]; exportAllowed: boolean } {
  const items: CitationBadge[] = [];
  const statute = /\b(HMK|İYUK|IYUK|CMK|İİK|IIK)\s*m\.?\s*(\d+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = statute.exec(text))) {
    const key = statuteKey(match[1], match[2]);
    const known = Object.entries(KNOWN_ARTICLES).find(([article]) => statuteKey(article.split(" ")[0], article.split(" ").pop() || "") === key)?.[1];
    items.push({
      raw: match[0],
      kind: "statute",
      status: known ? "verified" : "unverified",
      note: known || "Yerel madde dizininde doğrulanmadı.",
    });
  }
  const decision = /\b\d{4}\/\d{1,6}\s*E\.?\s*,?\s*\d{4}\/\d{1,6}\s*K\.?/gi;
  while ((match = decision.exec(text))) {
    items.push({
      raw: match[0],
      kind: "decision",
      status: "not_found",
      note: "Karar numarası kaynakta aranmadan dışa aktarılamaz.",
    });
  }
  const exportAllowed = items.every((item) => item.status === "verified");
  return { items, exportAllowed: items.length === 0 || exportAllowed };
}

export function buildDefenseDraft(input: {
  matterTitle: string;
  parties: string[];
  dossierNotes: string[];
  precedents: { citation: string; relation: string; snippet: string }[];
}): { text: string; citation: ReturnType<typeof checkCitations> } {
  const cloudSafeNotes = input.dossierNotes.slice(0, 6).map((note) => maskPii(note, input.parties));
  const text = [
    "CEVAP DİLEKÇESİ",
    "(HMK m. 129)",
    "",
    `Dava: ${input.matterTitle || "Belirtilmedi"}`,
    `Taraflar: ${input.parties.filter(Boolean).join(", ") || "—"}`,
    "",
    "I. Olaylar",
    cloudSafeNotes.map((note, index) => `${index + 1}. ${note}`).join("\n") || "Bağlı dosya özeti yok.",
    "",
    "II. Hukuki sebepler",
    "Savunma, HMK m. 129 uyarınca dilekçede gösterilen belgelere ve aşağıdaki emsallere dayanır.",
    "",
    "III. Emsaller",
    input.precedents.length
      ? input.precedents.map((item) => `- ${item.citation} (${item.relation}) ${item.snippet}`).join("\n")
      : "Bağlı emsal yok.",
    "",
    "IV. Sonuç ve istem",
    "Yukarıda gösterilen sebeplerle davanın reddine karar verilmesini saygıyla arz ederim.",
    "",
    "Bu metin taslaktır. İmza, tevdi ve gönderim yoktur.",
  ].join("\n");
  return { text, citation: checkCitations(text) };
}

export function presentationBrief(graph: { nodes?: any[]; edges?: any[] }, matterId?: string) {
  const nodes = graph.nodes || [];
  const matter = nodes.find((node) => node.id === matterId) || nodes.find((node) => node.type === "matter");
  const linked = new Set<string>(matter ? [matter.id] : []);
  (graph.edges || []).forEach((edge) => {
    if (linked.has(edge.source)) linked.add(edge.target);
    if (linked.has(edge.target)) linked.add(edge.source);
  });
  const scoped = matter ? nodes.filter((node) => linked.has(node.id)) : nodes;
  const chronology = scoped
    .filter((node) => node.type === "hearing" || node.type === "deadline" || node.type === "dossier")
    .map((node) => ({
      title: node.title,
      type: node.type,
      when: node.data?.date_time || node.data?.due_date || node.data?.date_filed || "",
      source: node.id,
    }));
  const precedents = scoped
    .filter((node) => node.type === "dossier" && String(node.data?.document_type || "").toLowerCase().includes("precedent"))
    .map((node) => ({
      title: node.title,
      citation: node.data?.exhibit_number || node.subtitle || "",
      source: node.id,
    }));
  return {
    matter: matter?.title || "Matter seçilmedi",
    chronology,
    position: matter?.data?.nature_of_suit || matter?.subtitle || "",
    risk: scoped.filter((node) => node.type === "deadline" && node.data?.priority === "Critical").map((node) => node.title),
    precedents,
  };
}

export async function saveConnectorToken(userId: number, connectorId: string, token: string) {
  await ensureAutomationTables();
  const id = crypto.randomUUID();
  await client.query(`DELETE FROM connector_accounts WHERE user_id = $1 AND connector_id = $2`, [userId, connectorId]);
  await client.query(
    `INSERT INTO connector_accounts (id, user_id, connector_id, token_cipher) VALUES ($1,$2,$3,$4)`,
    [id, userId, connectorId, encrypt(token)],
  );
  await audit({ userId, connectorId, tool: "connect", paramsSummary: "token stored", resultSummary: "ok" });
  return { id, connectorId };
}

export async function readMailbox(userId: number, connectorId: "gmail" | "outlook") {
  await ensureAutomationTables();
  const row = await client.query<{ token_cipher: string }>(
    `SELECT token_cipher FROM connector_accounts WHERE user_id = $1 AND connector_id = $2 LIMIT 1`,
    [userId, connectorId],
  );
  if (!row.rows[0]?.token_cipher) return { connected: false, messages: [] as { id: string; subject: string; from: string; snippet: string }[] };
  const token = decrypt(row.rows[0].token_cipher);
  const url = connectorId === "gmail"
    ? "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10"
    : "https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=id,subject,from,bodyPreview";
  const response = await politeFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    await audit({ userId, connectorId, tool: "list", resultSummary: `http ${response.status}` });
    return { connected: true, messages: [], error: "Posta kutusu okunamadı." };
  }
  const payload = await response.json();
  await audit({ userId, connectorId, tool: "list", resultSummary: "ok" });
  if (connectorId === "outlook") {
    const messages = (payload.value || []).map((item: any) => ({
      id: String(item.id),
      subject: String(item.subject || ""),
      from: String(item.from?.emailAddress?.address || ""),
      snippet: String(item.bodyPreview || ""),
    }));
    return { connected: true, messages };
  }
  const messages = (payload.messages || []).map((item: any) => ({
    id: String(item.id),
    subject: "",
    from: "",
    snippet: String(item.snippet || ""),
  }));
  return { connected: true, messages };
}

const MATTER_FOLDER_NAMES = ["Müvekkil", "Evraklar", "Notlar", "İçtihat", "Süreler"];

export async function matterTree(userId: number, matterId: string) {
  await ensureAutomationTables();
  const existing = await client.query(
    `SELECT id FROM matter_folders WHERE user_id = $1 AND matter_id = $2 LIMIT 1`,
    [userId, matterId],
  );
  if (!existing.rows.length) {
    for (let index = 0; index < MATTER_FOLDER_NAMES.length; index += 1) {
      const name = MATTER_FOLDER_NAMES[index];
      await client.query(
        `INSERT INTO matter_folders (id, user_id, matter_id, name, sort) VALUES ($1,$2,$3,$4,$5)`,
        [crypto.randomUUID(), userId, matterId, name, index],
      );
    }
  }
  const folders = await client.query(
    `SELECT id, parent_id, name, sort FROM matter_folders WHERE user_id = $1 AND matter_id = $2 ORDER BY sort, name`,
    [userId, matterId],
  );
  const files = await client.query(
    `SELECT id, folder_id, title, mime, sha256, preview, source, created_at FROM matter_files WHERE user_id = $1 AND matter_id = $2 ORDER BY created_at DESC`,
    [userId, matterId],
  );
  const notes = await client.query(
    `SELECT id, body, created_at FROM matter_notes WHERE user_id = $1 AND matter_id = $2 ORDER BY created_at DESC`,
    [userId, matterId],
  );
  return { folders: folders.rows, files: files.rows, notes: notes.rows };
}

export async function addMatterFolder(userId: number, matterId: string, name: string, parentId?: string) {
  await ensureAutomationTables();
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO matter_folders (id, user_id, matter_id, parent_id, name, sort) VALUES ($1,$2,$3,$4,$5,100)`,
    [id, userId, matterId, parentId || null, name.slice(0, 120) || "Klasör"],
  );
  return { id, name };
}

export async function addMatterFile(input: {
  userId: number;
  matterId: string;
  folderId?: string;
  title: string;
  mime?: string;
  preview?: string;
  sha256?: string;
  vaultBlobId?: string | null;
  source?: string;
}) {
  await ensureAutomationTables();
  const id = crypto.randomUUID();
  const preview = (input.preview || "").slice(0, 8000);
  await client.query(
    `INSERT INTO matter_files (id, user_id, matter_id, folder_id, title, mime, sha256, vault_blob_id, preview, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      input.userId,
      input.matterId,
      input.folderId || null,
      input.title.slice(0, 240) || "Belge",
      input.mime || "",
      input.sha256 || "",
      input.vaultBlobId || null,
      preview,
      input.source || "upload",
    ],
  );
  await audit({
    userId: input.userId,
    tool: "matter.file",
    paramsSummary: input.title.slice(0, 80),
    resultSummary: "dosya eklendi",
  });
  return { id, title: input.title, preview };
}

export async function moveMatterFile(userId: number, fileId: string, folderId: string | null, title?: string) {
  await ensureAutomationTables();
  if (title) {
    await client.query(
      `UPDATE matter_files SET folder_id = $1, title = $2 WHERE id = $3 AND user_id = $4`,
      [folderId, title.slice(0, 240), fileId, userId],
    );
  } else {
    await client.query(
      `UPDATE matter_files SET folder_id = $1 WHERE id = $2 AND user_id = $3`,
      [folderId, fileId, userId],
    );
  }
  return { id: fileId, folderId };
}

export async function addMatterNote(userId: number, matterId: string, body: string) {
  await ensureAutomationTables();
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO matter_notes (id, user_id, matter_id, body) VALUES ($1,$2,$3,$4)`,
    [id, userId, matterId, body.slice(0, 8000)],
  );
  return { id, body };
}
