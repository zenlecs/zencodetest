/**
 * ZenOS Studio — master data model.
 *
 * Mirrors ZenOS_Studio_Master_Data_Model.md. Every canvas node is a
 * discriminated union on `type`, and every node carries the full field set
 * for its type. Canvas cards render a summary; the inspector renders the
 * whole record.
 */

import type { JurisdictionCode } from "@shared/jurisdictionCatalog";

export type NodeType =
  | "entity"
  | "matter"
  | "dossier"
  | "hearing"
  | "deadline"
  | "agent"
  | "trigger"
  | "connector"
  | "ai_step"
  | "logic"
  | "approval"
  | "output";

export const AUTOMATION_NODE_TYPES: NodeType[] = [
  "trigger",
  "connector",
  "ai_step",
  "logic",
  "approval",
  "output",
];

export const NODE_TYPE_ORDER: NodeType[] = [
  "entity",
  "matter",
  "dossier",
  "hearing",
  "deadline",
  "agent",
  ...AUTOMATION_NODE_TYPES,
];

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  entity: "Taraf",
  matter: "Dava",
  dossier: "Dosya",
  hearing: "Duruşma",
  deadline: "Süre",
  agent: "Ajan",
  trigger: "Tetik",
  connector: "Bağlantı",
  ai_step: "Yapay zeka",
  logic: "Mantık",
  approval: "Onay",
  output: "Çıktı",
};

export type StepEffect = "read" | "draft" | "write" | "send" | "sign" | "delete";
export type EdgeKind = "relation" | "flow";

/** Standards supported by the Studio parser / ZenVault. */
export const SUPPORTED_STANDARDS = [
  "Akoma Ntoso 3.0 (OASIS)",
  "UDF (UYAP XML)",
  "XJustiz (DE)",
  "PACER/RECAP JSON",
  "OASIS ECF 4.01",
  "Forensic PDF/A-1b",
] as const;

export const COMPLIANCE_STATUSES = ["Compliant", "Supported", "Archival"] as const;

export const ENTITY_KINDS = ["Individual", "Corporation", "Partnership", "Public Body"] as const;
export const ENTITY_ROLES = [
  "Claimant",
  "Respondent",
  "Defendant",
  "Third Party",
  "Witness",
] as const;
export const ENTITY_STATUSES = ["Active", "Inactive", "Dissolved"] as const;

export const MATTER_STATUSES = [
  "Active Arbitration",
  "Pending",
  "Terminated",
  "Appeal",
] as const;
export const CONFIDENTIALITIES = ["Public", "Confidential", "Sealed"] as const;
export const CURRENCIES = ["USD", "EUR", "TRY", "GBP", "CHF"] as const;

export const DOSSIER_DOCUMENT_TYPES = ["Exhibit", "Memorial", "Order", "Petition", "UDF", "Precedent"] as const;
export const FORENSIC_STATUSES = ["Active", "Archival"] as const;

export const HEARING_TYPES = ["Merits", "Procedural", "Trial Session"] as const;
export const HEARING_STATUSES = ["Scheduled", "Completed", "Adjourned"] as const;

export const DEADLINE_PRIORITIES = ["Critical", "Normal", "Low"] as const;
export const DEADLINE_TYPES = ["Statutory Cutoff", "Filing", "Response"] as const;

export const AGENT_STATUSES = ["Active", "Paused"] as const;

export interface PostalAddress {
  street: string;
  city: string;
  postal_code: string;
  country: string;
}

export interface ComplianceSpec {
  standard: string;
  status: string;
}

export interface EntityData {
  entity_id: string;
  legal_name: string;
  entity_type: (typeof ENTITY_KINDS)[number];
  registration_number: string;
  jurisdiction: string;
  address: PostalAddress;
  represented_by_counsel: string;
  role_in_matter: (typeof ENTITY_ROLES)[number];
  status: (typeof ENTITY_STATUSES)[number];
  zenvault_verified: boolean;
  cipher: string;
  seal_status: string;
  checksum: string;
  compliance_specs: ComplianceSpec[];
}

export interface StatuteRef {
  jurisdiction: JurisdictionCode | string;
  code: string;
  number?: string;
  article: string;
  clause?: string;
  title?: string;
  verified: "verified" | "unverified" | "not_found" | "repealed";
}

export interface MatterParty {
  name: string;
  role: string;
}

export interface MatterData {
  matter_id: string;
  case_name: string;
  case_name_full: string;
  docket_number: string;
  court: string;
  nature_of_suit: string;
  status: (typeof MATTER_STATUSES)[number];
  date_filed: string;
  date_terminated: string;
  date_last_filing: string;
  claim_amount: number | null;
  currency: (typeof CURRENCIES)[number] | string;
  assigned_judge: string;
  parties: MatterParty[];
  confidentiality: (typeof CONFIDENTIALITIES)[number];
  jurisdiction_code: JurisdictionCode | string;
  procedure_family: string;
  court_id: string;
  seat: string;
  statutes_relied_on: StatuteRef[];
  client_profile_id: string;
  case_files: CaseFileRecord[];
  case_notes: CaseNoteRecord[];
  case_folders: CaseFolderRecord[];
  case_clients: CaseClientRecord[];
  case_precedents: CasePrecedentRecord[];
}

export interface CaseFileRecord {
  id: string;
  folder: string;
  title: string;
  preview: string;
}

export interface CaseNoteRecord {
  id: string;
  body: string;
  title?: string;
  folderId?: string;
}

export type CaseFolderKind = "client" | "documents" | "notes" | "precedent" | "custom";

export interface CaseFolderRecord {
  id: string;
  name: string;
  kind: CaseFolderKind;
  color: string;
}

export interface CasePaymentRecord {
  id: string;
  date: string;
  amount: string;
  description: string;
}

export interface CaseClientRecord {
  id: string;
  name: string;
  photo: string;
  nationalId: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  occupation: string;
  payments: CasePaymentRecord[];
}

export interface CasePrecedentRecord {
  id: string;
  folderId: string;
  citation: string;
  court: string;
  stance: "lehte" | "aleyhte" | "nötr";
  summary: string;
}

export interface DossierData {
  dossier_id: string;
  title: string;
  document_type: (typeof DOSSIER_DOCUMENT_TYPES)[number];
  format: string;
  exhibit_number: string;
  date_created: string;
  date_filed: string;
  zenvault_secured: boolean;
  related_matter_id: string;
  description: string;
  forensic_status: (typeof FORENSIC_STATUSES)[number];
  checksum: string;
  compliance_specs: ComplianceSpec[];
}

export interface HearingData {
  hearing_id: string;
  title: string;
  date_time: string;
  location: string;
  type: (typeof HEARING_TYPES)[number];
  status: (typeof HEARING_STATUSES)[number];
  related_matter_id: string;
}

export interface DeadlineData {
  deadline_id: string;
  title: string;
  due_date: string;
  priority: (typeof DEADLINE_PRIORITIES)[number];
  type: (typeof DEADLINE_TYPES)[number];
  related_matter_id: string;
  related_hearing_id: string;
}

export interface AgentData {
  agent_id: string;
  name: string;
  agent_type: string;
  status: (typeof AGENT_STATUSES)[number];
  watches_matter_id: string;
  last_run: string;
  notes: string;
}

export interface AutomationData {
  step_id: string;
  name: string;
  effect: StepEffect;
  connector_id: string;
  tool: string;
  ports_in: string;
  ports_out: string;
  config_json: string;
  status: string;
}

export type NodeData =
  | EntityData
  | MatterData
  | DossierData
  | HearingData
  | DeadlineData
  | AgentData
  | AutomationData;

export interface StudioNodeBase {
  id: string;
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  jurisdiction?: string;
  status?: string;
  /** Optional thumbnail assigned to the node, stored as a data URL. */
  image?: string;
  glowColor?: string;
}

export type StudioNode =
  | (StudioNodeBase & { type: "entity"; data: EntityData })
  | (StudioNodeBase & { type: "matter"; data: MatterData })
  | (StudioNodeBase & { type: "dossier"; data: DossierData })
  | (StudioNodeBase & { type: "hearing"; data: HearingData })
  | (StudioNodeBase & { type: "deadline"; data: DeadlineData })
  | (StudioNodeBase & { type: "agent"; data: AgentData })
  | (StudioNodeBase & { type: "trigger"; data: AutomationData })
  | (StudioNodeBase & { type: "connector"; data: AutomationData })
  | (StudioNodeBase & { type: "ai_step"; data: AutomationData })
  | (StudioNodeBase & { type: "logic"; data: AutomationData })
  | (StudioNodeBase & { type: "approval"; data: AutomationData })
  | (StudioNodeBase & { type: "output"; data: AutomationData });

/* ------------------------------------------------------------------ */
/* Field descriptors                                                   */
/* ------------------------------------------------------------------ */

export type FieldType =
  | "text"
  | "textarea"
  | "date"
  | "datetime"
  | "number"
  | "select"
  | "boolean"
  | "address"
  | "parties"
  | "compliance";

export interface NodeFieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  placeholder?: string;
  /** This field is the node's display title. */
  title?: boolean;
  /** Select options are resolved from canvas nodes of this type. */
  ref?: NodeType;
  /** Belongs to the ZenVault section rather than the main field list. */
  vault?: boolean;
  /** Pair a numeric field with a currency key. */
  suffixKey?: string;
}

const AUTOMATION_EFFECTS = ["read", "draft", "write", "send", "sign", "delete"] as const;

const AUTOMATION_FIELDS: NodeFieldDef[] = [
  { key: "name", label: "Ad", type: "text", title: true },
  { key: "effect", label: "Etki", type: "select", options: AUTOMATION_EFFECTS },
  { key: "connector_id", label: "Bağlantı", type: "text", placeholder: "danistay" },
  { key: "tool", label: "Araç", type: "text" },
  { key: "ports_in", label: "Giriş", type: "text", placeholder: "docs, matterRef" },
  { key: "ports_out", label: "Çıkış", type: "text", placeholder: "docs, text" },
  { key: "config_json", label: "Ayar", type: "textarea" },
  { key: "status", label: "Durum", type: "text" },
  { key: "step_id", label: "Adım kimliği", type: "text" },
];

export const NODE_FIELDS: Record<NodeType, NodeFieldDef[]> = {
  entity: [
    { key: "legal_name", label: "Tüzel ad", type: "text", title: true },
    { key: "entity_type", label: "Tür", type: "select", options: ENTITY_KINDS },
    { key: "role_in_matter", label: "Rol", type: "select", options: ENTITY_ROLES },
    { key: "status", label: "Durum", type: "select", options: ENTITY_STATUSES },
    { key: "registration_number", label: "Sicil no", type: "text" },
    { key: "jurisdiction", label: "Yargı yeri", type: "text" },
    { key: "represented_by_counsel", label: "Vekil", type: "text" },
    { key: "address", label: "Adres", type: "address" },
    { key: "entity_id", label: "Entity ID", type: "text" },
    { key: "zenvault_verified", label: "Doğrulama", type: "boolean", vault: true },
    { key: "cipher", label: "Şifreleme", type: "text", vault: true },
    { key: "seal_status", label: "Mühür", type: "text", vault: true },
    { key: "checksum", label: "Checksum", type: "text", vault: true },
    { key: "compliance_specs", label: "Uyumluluk", type: "compliance", vault: true },
  ],
  matter: [
    { key: "case_name", label: "Dava adı", type: "text", title: true },
    { key: "case_name_full", label: "Tam ad", type: "text" },
    { key: "docket_number", label: "Esas no", type: "text" },
    { key: "jurisdiction_code", label: "Yargı", type: "select", options: [] },
    { key: "court_id", label: "Mahkeme", type: "select", options: [] },
    { key: "procedure_family", label: "Usul", type: "select", options: [] },
    { key: "court", label: "Mahkeme adı", type: "text" },
    { key: "nature_of_suit", label: "Dava türü", type: "text" },
    { key: "status", label: "Durum", type: "select", options: MATTER_STATUSES },
    { key: "date_filed", label: "Açılış", type: "date" },
    { key: "date_terminated", label: "Kapanış", type: "date" },
    { key: "date_last_filing", label: "Son işlem", type: "date" },
    {
      key: "claim_amount",
      label: "Talep",
      type: "number",
      suffixKey: "currency",
      placeholder: "42500000",
    },
    { key: "currency", label: "Para birimi", type: "select", options: CURRENCIES },
    { key: "assigned_judge", label: "Hâkim / hakem", type: "text" },
    { key: "parties", label: "Taraflar", type: "parties" },
    { key: "confidentiality", label: "Gizlilik", type: "select", options: CONFIDENTIALITIES },
    { key: "matter_id", label: "Matter ID", type: "text" },
  ],
  dossier: [
    { key: "title", label: "Başlık", type: "text", title: true },
    { key: "document_type", label: "Belge türü", type: "select", options: DOSSIER_DOCUMENT_TYPES },
    { key: "format", label: "Format", type: "select", options: SUPPORTED_STANDARDS },
    { key: "exhibit_number", label: "Delil no", type: "text" },
    { key: "date_created", label: "Oluşturma", type: "date" },
    { key: "date_filed", label: "Sunum", type: "date" },
    { key: "forensic_status", label: "Forensic", type: "select", options: FORENSIC_STATUSES },
    { key: "related_matter_id", label: "Bağlı dava", type: "select", ref: "matter" },
    { key: "description", label: "Açıklama", type: "textarea" },
    { key: "dossier_id", label: "Dossier ID", type: "text" },
    { key: "zenvault_secured", label: "ZenVault", type: "boolean", vault: true },
    { key: "checksum", label: "Checksum", type: "text", vault: true },
    { key: "compliance_specs", label: "Uyumluluk", type: "compliance", vault: true },
  ],
  hearing: [
    { key: "title", label: "Başlık", type: "text", title: true },
    { key: "date_time", label: "Tarih / saat", type: "datetime" },
    { key: "location", label: "Yer", type: "text" },
    { key: "type", label: "Tür", type: "select", options: HEARING_TYPES },
    { key: "status", label: "Durum", type: "select", options: HEARING_STATUSES },
    { key: "related_matter_id", label: "Bağlı dava", type: "select", ref: "matter" },
    { key: "hearing_id", label: "Hearing ID", type: "text" },
  ],
  deadline: [
    { key: "title", label: "Başlık", type: "text", title: true },
    { key: "due_date", label: "Son tarih", type: "date" },
    { key: "priority", label: "Öncelik", type: "select", options: DEADLINE_PRIORITIES },
    { key: "type", label: "Tür", type: "select", options: DEADLINE_TYPES },
    { key: "related_matter_id", label: "Bağlı dava", type: "select", ref: "matter" },
    { key: "related_hearing_id", label: "Bağlı duruşma", type: "select", ref: "hearing" },
    { key: "deadline_id", label: "Deadline ID", type: "text" },
  ],
  agent: [
    { key: "name", label: "Ad", type: "text", title: true },
    { key: "agent_type", label: "Tür", type: "text", placeholder: "Monitoring / Watchdog" },
    { key: "status", label: "Durum", type: "select", options: AGENT_STATUSES },
    { key: "watches_matter_id", label: "İzlenen dava", type: "select", ref: "matter" },
    { key: "last_run", label: "Son çalışma", type: "datetime" },
    { key: "notes", label: "Notlar", type: "textarea" },
    { key: "agent_id", label: "Agent ID", type: "text" },
  ],
  trigger: AUTOMATION_FIELDS,
  connector: AUTOMATION_FIELDS,
  ai_step: AUTOMATION_FIELDS,
  logic: AUTOMATION_FIELDS,
  approval: AUTOMATION_FIELDS,
  output: AUTOMATION_FIELDS,
};

/** Fields shown in the compact "Özet" section of the overview. */
export const SUMMARY_KEYS: Record<NodeType, string[]> = {
  entity: ["entity_type", "role_in_matter", "status", "represented_by_counsel"],
  matter: ["docket_number", "jurisdiction_code", "court_id", "procedure_family", "status", "date_filed"],
  dossier: ["document_type", "format", "exhibit_number", "forensic_status", "related_matter_id"],
  hearing: ["date_time", "location", "type", "status", "related_matter_id"],
  deadline: ["due_date", "priority", "type", "related_matter_id"],
  agent: ["agent_type", "status", "watches_matter_id", "last_run"],
  trigger: ["effect", "status"],
  connector: ["connector_id", "effect", "tool"],
  ai_step: ["effect", "tool", "status"],
  logic: ["effect", "status"],
  approval: ["effect", "status"],
  output: ["effect", "ports_out"],
};

/** Fields offered in the create-node sheet. */
export const CREATE_FIELD_KEYS: Record<NodeType, string[]> = {
  entity: ["legal_name", "entity_type", "role_in_matter", "jurisdiction"],
  matter: ["case_name", "docket_number", "jurisdiction_code", "court_id", "procedure_family"],
  dossier: ["title", "document_type", "format", "exhibit_number"],
  hearing: ["title", "date_time", "location", "type"],
  deadline: ["title", "due_date", "priority", "type"],
  agent: ["name", "agent_type", "status"],
  trigger: ["name", "effect"],
  connector: ["name", "connector_id", "effect"],
  ai_step: ["name", "effect"],
  logic: ["name", "effect"],
  approval: ["name", "effect"],
  output: ["name", "effect"],
};

export const NODE_ID_FIELD: Record<NodeType, string> = {
  entity: "entity_id",
  matter: "matter_id",
  dossier: "dossier_id",
  hearing: "hearing_id",
  deadline: "deadline_id",
  agent: "agent_id",
  trigger: "step_id",
  connector: "step_id",
  ai_step: "step_id",
  logic: "step_id",
  approval: "step_id",
  output: "step_id",
};

export const NODE_TITLE_FIELD: Record<NodeType, string> = {
  entity: "legal_name",
  matter: "case_name",
  dossier: "title",
  hearing: "title",
  deadline: "title",
  agent: "name",
  trigger: "name",
  connector: "name",
  ai_step: "name",
  logic: "name",
  approval: "name",
  output: "name",
};

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);

export function newStudioNodeId(type: NodeType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createNodeData(type: NodeType, id: string): NodeData {
  switch (type) {
    case "entity":
      return {
        entity_id: id,
        legal_name: "",
        entity_type: "Corporation",
        registration_number: "",
        jurisdiction: "",
        address: { street: "", city: "", postal_code: "", country: "" },
        represented_by_counsel: "",
        role_in_matter: "Claimant",
        status: "Active",
        zenvault_verified: false,
        cipher: "",
        seal_status: "",
        checksum: "",
        compliance_specs: [],
      };
    case "matter":
      return {
        matter_id: id,
        case_name: "",
        case_name_full: "",
        docket_number: "",
        court: "",
        nature_of_suit: "",
        status: "Pending",
        date_filed: today(),
        date_terminated: "",
        date_last_filing: "",
        claim_amount: null,
        currency: "USD",
        assigned_judge: "",
        parties: [],
        confidentiality: "Confidential",
        jurisdiction_code: "TR",
        procedure_family: "HMK",
        court_id: "tr-asliye-hukuk",
        seat: "",
        statutes_relied_on: [],
        client_profile_id: "",
        case_files: [],
        case_notes: [],
        case_folders: [],
        case_clients: [],
        case_precedents: [],
      };
    case "dossier":
      return {
        dossier_id: id,
        title: "",
        document_type: "Exhibit",
        format: SUPPORTED_STANDARDS[0],
        exhibit_number: "",
        date_created: today(),
        date_filed: "",
        zenvault_secured: false,
        related_matter_id: "",
        description: "",
        forensic_status: "Active",
        checksum: "",
        compliance_specs: [],
      };
    case "hearing":
      return {
        hearing_id: id,
        title: "",
        date_time: "",
        location: "",
        type: "Procedural",
        status: "Scheduled",
        related_matter_id: "",
      };
    case "deadline":
      return {
        deadline_id: id,
        title: "",
        due_date: "",
        priority: "Normal",
        type: "Filing",
        related_matter_id: "",
        related_hearing_id: "",
      };
    case "agent":
      return {
        agent_id: id,
        name: "",
        agent_type: "Watchdog",
        status: "Active",
        watches_matter_id: "",
        last_run: "",
        notes: "",
      };
    case "trigger":
    case "connector":
    case "ai_step":
    case "logic":
    case "approval":
    case "output":
      return {
        step_id: id,
        name: "",
        effect: type === "approval" ? "send" : type === "ai_step" ? "draft" : "read",
        connector_id: type === "connector" ? "danistay" : "",
        tool: "",
        ports_in: "docs",
        ports_out: "docs",
        config_json: "",
        status: "hazır",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function nodeDataRecord(node: StudioNode): Record<string, any> {
  return node.data as unknown as Record<string, any>;
}

export function patchNodeData(node: StudioNode, patch: Record<string, any>): StudioNode {
  return {
    ...node,
    data: { ...nodeDataRecord(node), ...patch },
  } as StudioNode;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function formatDate(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = dateOnly ? new Date(`${raw}T12:00:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const hasTime = raw.includes("T") && !raw.endsWith("T00:00");
  if (!hasTime) return formatDate(raw);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatClaim(amount: unknown, currency: unknown): string {
  if (amount === null || amount === undefined || amount === "") return "";
  const numeric = typeof amount === "number" ? amount : Number(asString(amount).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return asString(amount);
  const code = asString(currency).toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${new Intl.NumberFormat("tr-TR").format(numeric)} ${code}`;
  }
}

export function formatAddress(value: unknown): string {
  if (!value || typeof value !== "object") return asString(value);
  const address = value as Partial<PostalAddress>;
  return [address.street, address.city, address.postal_code, address.country]
    .map((part) => asString(part).trim())
    .filter(Boolean)
    .join(", ");
}

export function partiesToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((party) => {
      if (!party || typeof party !== "object") return asString(party);
      const p = party as MatterParty;
      return [p.name, p.role].filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("\n");
}

export function textToParties(value: string): MatterParty[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split("|");
      return { name: name.trim(), role: rest.join("|").trim() };
    })
    .filter((party) => party.name);
}

/** Recompute the canvas-level summary fields from the master record. */
export function syncNodeIdentity(node: StudioNode): StudioNode {
  const data = nodeDataRecord(node);
  let title = node.title;
  let subtitle: string | undefined;
  let jurisdiction: string | undefined;
  let status: string | undefined;

  switch (node.type) {
    case "entity":
      title = asString(data.legal_name) || "Yeni Taraf";
      subtitle = [data.entity_type, data.role_in_matter].filter(Boolean).join(" · ");
      jurisdiction = asString(data.jurisdiction) || undefined;
      status = asString(data.status) || undefined;
      break;
    case "matter":
      title = asString(data.case_name) || "Yeni Dava";
      subtitle = [data.docket_number, data.court].filter(Boolean).join(" · ");
      jurisdiction = asString(data.court) || undefined;
      status = asString(data.status) || undefined;
      break;
    case "dossier":
      title = asString(data.title) || "Yeni Dosya";
      subtitle = [data.document_type, data.format].filter(Boolean).join(" · ");
      jurisdiction = asString(data.format) || undefined;
      status = asString(data.forensic_status) || undefined;
      break;
    case "hearing":
      title = asString(data.title) || "Yeni Duruşma";
      subtitle = [data.type, formatDateTime(data.date_time)].filter(Boolean).join(" · ");
      jurisdiction = asString(data.location) || undefined;
      status = asString(data.status) || undefined;
      break;
    case "deadline":
      title = asString(data.title) || "Yeni Süre";
      subtitle = [data.type, formatDate(data.due_date)].filter(Boolean).join(" · ");
      jurisdiction = undefined;
      status = asString(data.priority) || undefined;
      break;
    case "agent":
      title = asString(data.name) || "Yeni Ajan";
      subtitle = asString(data.agent_type) || undefined;
      jurisdiction = undefined;
      status = asString(data.status) || undefined;
      break;
    case "trigger":
    case "connector":
    case "ai_step":
    case "logic":
    case "approval":
    case "output":
      title = asString(data.name) || NODE_TYPE_LABEL[node.type];
      subtitle = asString(data.connector_id || data.effect) || undefined;
      jurisdiction = undefined;
      status = asString(data.status) || undefined;
      break;
  }

  return { ...node, title, subtitle, jurisdiction, status } as StudioNode;
}

export function buildStudioNode(
  type: NodeType,
  id: string,
  x: number,
  y: number,
  data: NodeData,
): StudioNode {
  return syncNodeIdentity({ id, type, x, y, title: "", data } as StudioNode);
}

export function duplicateStudioNode(node: StudioNode): StudioNode {
  const id = newStudioNodeId(node.type);
  const data = {
    ...nodeDataRecord(node),
    [NODE_ID_FIELD[node.type]]: id,
  };
  const titleKey = NODE_TITLE_FIELD[node.type];
  if (data[titleKey]) data[titleKey] = `${data[titleKey]} (Kopya)`;
  return syncNodeIdentity({
    ...node,
    id,
    x: node.x + 40,
    y: node.y + 40,
    data,
  } as StudioNode);
}

/* ------------------------------------------------------------------ */
/* Canvas summary                                                      */
/* ------------------------------------------------------------------ */

export type SummaryTone = "danger" | "active" | "neutral";

export interface NodeSummary {
  title: string;
  meta: string;
  status?: string;
  statusTone: SummaryTone;
  metric?: { label: string; value: string; tone: "danger" | "success" | "neutral" };
}

export function getNodeSummary(node: StudioNode): NodeSummary {
  const data = nodeDataRecord(node);

  switch (node.type) {
    case "entity": {
      const status = asString(data.status) || node.status;
      return {
        title: asString(data.legal_name) || node.title,
        meta:
          [data.entity_type, data.role_in_matter].filter(Boolean).join(" · ") ||
          asString(data.jurisdiction),
        status,
        statusTone: status === "Active" ? "active" : "neutral",
        metric: data.registration_number
          ? { label: "Sicil", value: asString(data.registration_number), tone: "neutral" }
          : data.represented_by_counsel
            ? { label: "Vekil", value: asString(data.represented_by_counsel), tone: "neutral" }
            : undefined,
      };
    }
    case "matter": {
      const status = asString(data.status) || node.status;
      const claim = formatClaim(data.claim_amount, data.currency);
      return {
        title: asString(data.case_name) || node.title,
        meta: [data.docket_number, data.court].filter(Boolean).join(" · "),
        status,
        statusTone: status === "Terminated" ? "neutral" : "active",
        metric: claim ? { label: "Talep", value: claim, tone: "success" } : undefined,
      };
    }
    case "dossier": {
      const status = asString(data.forensic_status) || node.status;
      return {
        title: asString(data.title) || node.title,
        meta: [data.document_type, data.format].filter(Boolean).join(" · "),
        status,
        statusTone: status === "Active" ? "active" : "neutral",
        metric: data.exhibit_number
          ? { label: "Delil", value: asString(data.exhibit_number), tone: "neutral" }
          : data.date_filed
            ? { label: "Sunum", value: formatDate(data.date_filed), tone: "neutral" }
            : undefined,
      };
    }
    case "hearing": {
      const status = asString(data.status) || node.status;
      return {
        title: asString(data.title) || node.title,
        meta: [formatDateTime(data.date_time), data.location].filter(Boolean).join(" · "),
        status,
        statusTone: status === "Scheduled" ? "active" : "neutral",
        metric: data.type
          ? { label: "Tür", value: asString(data.type), tone: "neutral" }
          : undefined,
      };
    }
    case "deadline": {
      const priority = asString(data.priority) || node.status;
      const critical = priority === "Critical";
      return {
        title: asString(data.title) || node.title,
        meta: [data.type, data.related_matter_id ? "Bağlı dava" : ""].filter(Boolean).join(" · "),
        status: priority,
        statusTone: critical ? "danger" : "neutral",
        metric: data.due_date
          ? {
              label: "Son tarih",
              value: formatDate(data.due_date),
              tone: critical ? "danger" : "neutral",
            }
          : undefined,
      };
    }
    case "agent": {
      const status = asString(data.status) || node.status;
      return {
        title: asString(data.name) || node.title,
        meta: asString(data.agent_type),
        status,
        statusTone: status === "Active" ? "active" : "neutral",
        metric: data.last_run
          ? { label: "Son çalışma", value: formatDateTime(data.last_run), tone: "neutral" }
          : undefined,
      };
    }
    case "trigger":
    case "connector":
    case "ai_step":
    case "logic":
    case "approval":
    case "output": {
      const status = asString(data.status) || node.status;
      return {
        title: asString(data.name) || node.title,
        meta: [data.connector_id, data.effect].filter(Boolean).join(" · "),
        status,
        statusTone: status === "hazır" ? "active" : "neutral",
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Legacy migration                                                    */
/* ------------------------------------------------------------------ */

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return value;
  const text = asString(value);
  if (!text) return null;
  const numeric = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseCurrency(value: unknown): string {
  const match = asString(value).match(/\b(USD|EUR|TRY|GBP|CHF)\b/i);
  return match ? match[1].toUpperCase() : "USD";
}

function isNodeType(value: unknown): value is NodeType {
  return typeof value === "string" && (NODE_TYPE_ORDER as string[]).includes(value);
}

/** Map legacy short format tokens onto the supported standards. */
function normalizeFormat(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("akoma")) return SUPPORTED_STANDARDS[0];
  if (lower.includes("udf") || lower.includes("uyap")) return SUPPORTED_STANDARDS[1];
  if (lower.includes("xjustiz")) return SUPPORTED_STANDARDS[2];
  if (lower.includes("pacer") || lower.includes("recap")) return SUPPORTED_STANDARDS[3];
  if (lower.includes("ecf")) return SUPPORTED_STANDARDS[4];
  if (lower.includes("pdf/a") || lower.includes("pdfa")) return SUPPORTED_STANDARDS[5];
  return raw;
}

function normalizePriority(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("critical") || lower.includes("urgent")) return "Critical";
  if (lower.includes("low")) return "Low";
  if (lower.includes("normal")) return "Normal";
  return raw;
}

/**
 * Accepts any stored / imported node and produces a fully-shaped StudioNode.
 * Legacy `evidence` and `statute` nodes become dossiers.
 */
export function migrateStudioNode(raw: any): StudioNode | null {
  if (!raw || typeof raw !== "object") return null;

  const legacyType = raw.type === "evidence" || raw.type === "statute" ? "dossier" : raw.type;
  if (!isNodeType(legacyType)) return null;

  const type = legacyType;
  const id = asString(raw.id) || newStudioNodeId(type);
  const defaults = createNodeData(type, id) as Record<string, any>;
  const incoming = raw.data && typeof raw.data === "object" ? raw.data : {};
  const data: Record<string, any> = { ...defaults, ...incoming };

  const title = asString(raw.title);

  switch (type) {
    case "entity":
      data.legal_name = data.legal_name || title;
      if (incoming.clientType === "Corporate") data.entity_type = "Corporation";
      data.represented_by_counsel =
        data.represented_by_counsel || incoming.counselOfRecord || "";
      break;
    case "matter":
      data.case_name = data.case_name || title;
      data.docket_number =
        data.docket_number || incoming.docketNumber || asString(raw.subtitle);
      data.court = data.court || incoming.tribunal || asString(raw.jurisdiction);
      data.assigned_judge = data.assigned_judge || incoming.presidingArbitrator || "";
      if (data.claim_amount == null && incoming.claimAmount != null) {
        data.claim_amount = parseAmount(incoming.claimAmount);
        data.currency = parseCurrency(incoming.claimAmount);
      }
      break;
    case "dossier":
      data.title = data.title || title;
      data.format = normalizeFormat(data.format) || SUPPORTED_STANDARDS[0];
      if (incoming.vaultSecured != null && data.zenvault_secured == null) {
        data.zenvault_secured = Boolean(incoming.vaultSecured);
      }
      if (incoming.checksum) data.checksum = data.checksum || incoming.checksum;
      break;
    case "hearing":
      data.title = data.title || title;
      data.date_time = data.date_time || incoming.date || "";
      data.location = data.location || incoming.venue || asString(raw.jurisdiction);
      break;
    case "deadline":
      data.title = data.title || title;
      data.due_date = data.due_date || incoming.dueDate || "";
      data.priority = normalizePriority(data.priority) || "Normal";
      data.type = incoming.ruleType
        ? "Statutory Cutoff"
        : data.type || "Filing";
      break;
    case "agent":
      data.name = data.name || title;
      data.agent_type = data.agent_type || incoming.agentType || "Watchdog";
      break;
    case "trigger":
    case "connector":
    case "ai_step":
    case "logic":
    case "approval":
    case "output":
      data.name = data.name || title;
      break;
  }

  return syncNodeIdentity({
    id,
    type,
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 0,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : 0,
    title,
    image: typeof raw.image === "string" ? raw.image : undefined,
    data,
  } as StudioNode);
}

export function complianceStatus(
  specs: unknown,
  standard: string,
): string {
  if (!Array.isArray(specs)) return "";
  const match = specs.find(
    (spec) => spec && typeof spec === "object" && (spec as ComplianceSpec).standard === standard,
  );
  return match ? asString((match as ComplianceSpec).status) : "";
}
