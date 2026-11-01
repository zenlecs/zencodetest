import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, Save, X } from "lucide-react";
import { GlassSelect, type GlassSelectOption } from "./GlassSelect";
import { apple } from "./tokens";
import { courtsFor, familiesFor, JURISDICTIONS } from "@shared/jurisdictionCatalog";
import {
  COMPLIANCE_STATUSES,
  NODE_FIELDS,
  SUMMARY_KEYS,
  SUPPORTED_STANDARDS,
  complianceStatus,
  formatAddress,
  formatClaim,
  formatDate,
  formatDateTime,
  nodeDataRecord,
  partiesToText,
  textToParties,
  type NodeFieldDef,
  type NodeType,
  type StudioNode,
} from "./types";

type RefOptions = (type: NodeType) => GlassSelectOption[];

interface FieldInputProps {
  field: NodeFieldDef;
  value: any;
  onChange: (value: any) => void;
  refOptions: RefOptions;
  variant?: "row" | "form";
  record?: Record<string, any>;
}

const ADDRESS_PARTS: { key: "street" | "city" | "postal_code" | "country"; label: string }[] = [
  { key: "street", label: "Sokak" },
  { key: "city", label: "Şehir" },
  { key: "postal_code", label: "Posta kodu" },
  { key: "country", label: "Ülke" },
];

const EMPTY = "—";

export function CopyText({
  text,
  align = "start",
  multiline = false,
  className = "",
  textClassName = "",
  style,
  children,
}: {
  text: string;
  align?: "start" | "end";
  multiline?: boolean;
  className?: string;
  textClassName?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const value = text.trim();
  const canCopy = value.length > 0 && value !== EMPTY;

  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!canCopy) {
    return (
      <span className={className} style={style}>
        {children ?? text}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Kopyalandı" : "Kopyala"}
      className={`group/copy inline-flex min-w-0 items-start gap-1.5 bg-transparent p-0 ${
        align === "end" ? "justify-end text-right" : "justify-start text-left"
      } ${className}`}
      style={style}
    >
      <span
        className={`mt-[2px] shrink-0 transition-colors ${
          copied ? "text-[#30d158]" : "text-white/35 group-hover/copy:text-white/70"
        }`}
      >
        {copied ? <Check className="h-3 w-3" strokeWidth={2.4} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
      </span>
      <span className={`min-w-0 ${multiline ? "break-words whitespace-pre-wrap" : ""} ${textClassName}`}>
        {children ?? text}
      </span>
    </button>
  );
}

function emptyStyle(isEmpty: boolean) {
  return isEmpty ? { color: "rgba(235,235,245,0.32)" } : undefined;
}

function formatFieldValue(field: NodeFieldDef, data: Record<string, any>, refOptions: RefOptions): string {
  const raw = data[field.key];

  switch (field.type) {
    case "date":
      return formatDate(raw) || EMPTY;
    case "datetime":
      return formatDateTime(raw) || EMPTY;
    case "boolean":
      return raw === true ? "Evet" : raw === false ? "Hayır" : EMPTY;
    case "address":
      return formatAddress(raw) || EMPTY;
    case "parties": {
      const text = partiesToText(raw);
      return text ? text.replace(/\n/g, ", ") : EMPTY;
    }
    case "number": {
      if (field.suffixKey) return formatClaim(raw, data[field.suffixKey]) || EMPTY;
      if (raw === null || raw === undefined || raw === "") return EMPTY;
      const numeric = Number(raw);
      return Number.isFinite(numeric)
        ? new Intl.NumberFormat("tr-TR").format(numeric)
        : String(raw);
    }
    case "select": {
      if (!raw) return EMPTY;
      if (field.ref) {
        const match = refOptions(field.ref).find((option) => option.value === raw);
        return match?.label || String(raw);
      }
      return String(raw);
    }
    default:
      return raw === null || raw === undefined || raw === "" ? EMPTY : String(raw);
  }
}

function OverviewRow({
  field,
  data,
  refOptions,
}: {
  field: NodeFieldDef;
  data: Record<string, any>;
  refOptions: RefOptions;
}) {
  const value = formatFieldValue(field, data, refOptions);
  const isEmpty = value === EMPTY;
  const multiline = field.type === "textarea" || field.type === "parties";

  return (
    <div className="liquid-row items-start">
      <span className="liquid-row-label">{field.label}</span>
      <CopyText
        text={value}
        align="end"
        multiline={multiline}
        className={
          multiline
            ? "liquid-row-value max-w-[70%] text-[12.5px] leading-[1.5]"
            : "liquid-row-value max-w-[248px] text-[12.5px] leading-[1.45]"
        }
        textClassName={multiline ? "" : "truncate"}
        style={emptyStyle(isEmpty)}
      />
    </div>
  );
}

export function NodeOverview({
  node,
  refOptions,
}: {
  node: StudioNode;
  refOptions: RefOptions;
}) {
  const data = nodeDataRecord(node);
  const fields = NODE_FIELDS[node.type].filter((field) => !field.vault);
  const summaryKeys = SUMMARY_KEYS[node.type];
  const summaryFields = summaryKeys
    .map((key) => fields.find((field) => field.key === key))
    .filter((field): field is NodeFieldDef => Boolean(field));
  const detailFields = fields.filter(
    (field) => !summaryKeys.includes(field.key) && !field.title,
  );

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section>
        <div className="liquid-section-label">
          <span>Özet</span>
        </div>
        <div className="liquid-group">
          {summaryFields.map((field) => (
            <OverviewRow key={field.key} field={field} data={data} refOptions={refOptions} />
          ))}
        </div>
      </section>

      {detailFields.length > 0 && (
        <section>
          <div className="liquid-section-label">
            <span>Alanlar</span>
            <span className="font-mono text-[10px] normal-case tracking-[0.01em] text-white/50">
              {detailFields.length}
            </span>
          </div>
          <div className="liquid-group">
            {detailFields.map((field) => (
              <OverviewRow key={field.key} field={field} data={data} refOptions={refOptions} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Edit                                                               */
/* ------------------------------------------------------------------ */

function FieldInput({ field, value, onChange, refOptions, variant = "row", record }: FieldInputProps) {
  const form = variant === "form";
  const formControl =
    "w-full rounded-[8px] text-[14px] h-11 px-3 border outline-none";
  const formStyle = {
    backgroundColor: apple.black,
    borderColor: apple.hairline,
    color: apple.parchment,
  } as const;

  if (field.type === "select" || field.type === "boolean") {
    const options: GlassSelectOption[] =
      field.type === "boolean"
        ? [
            { value: "true", label: "Evet" },
            { value: "false", label: "Hayır" },
          ]
        : field.key === "jurisdiction_code"
          ? JURISDICTIONS.map((item) => ({ value: item.code, label: item.labelTr }))
          : field.key === "court_id"
            ? courtsFor(String(record?.jurisdiction_code || "TR")).map((court) => ({
                value: court.id,
                label: court.labelTr,
              }))
            : field.key === "procedure_family"
              ? familiesFor(String(record?.jurisdiction_code || "TR")).map((family) => ({
                  value: family,
                  label: family,
                }))
          : field.ref
          ? refOptions(field.ref)
          : (field.options ?? []).map((option) => ({ value: option, label: option }));

    const current =
      field.type === "boolean"
        ? value === true
          ? "true"
          : value === false
            ? "false"
            : ""
        : value === null || value === undefined
          ? ""
          : String(value);

    // Keep imported / legacy values visible and selectable even when they are
    // not part of the current enum.
    const resolvedOptions =
      current && !options.some((option) => option.value === current)
        ? [{ value: current, label: current }, ...options]
        : options;

    return (
      <GlassSelect
        value={current}
        onChange={(next) => onChange(field.type === "boolean" ? next === "true" : next)}
        options={resolvedOptions}
        placeholder={field.placeholder || "Seçin…"}
        ariaLabel={field.label}
        className={
          form
            ? "!h-11 !rounded-[8px] !px-3 !text-[14px] !font-normal !bg-black !shadow-none !border !border-white/10"
            : "!text-right"
        }
      />
    );
  }

  if (field.type === "textarea" || field.type === "parties") {
    const text = field.type === "parties" ? partiesToText(value) : String(value ?? "");
    return (
      <textarea
        value={text}
        onChange={(event) =>
          onChange(field.type === "parties" ? textToParties(event.target.value) : event.target.value)
        }
        placeholder={
          field.placeholder ||
          (field.type === "parties" ? "Her satır: Ad | Rol" : "")
        }
        className={
          form
            ? `${formControl} h-24 py-2 resize-none`
            : "liquid-input !h-[64px] py-2 flex-1 resize-none !text-[12.5px]"
        }
        style={form ? formStyle : undefined}
      />
    );
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "datetime"
        ? "datetime-local"
        : field.type === "number"
          ? "number"
          : "text";

  return (
    <input
      type={inputType}
      value={value === null || value === undefined ? "" : value}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(field.type === "number" ? (raw === "" ? null : Number(raw)) : raw);
      }}
      placeholder={field.placeholder}
      className={form ? formControl : "liquid-input liquid-input-inline flex-1"}
      style={form ? formStyle : undefined}
    />
  );
}

function AddressEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: Record<string, string>) => void;
}) {
  const address = (value && typeof value === "object" ? value : {}) as Record<string, string>;

  return (
    <div className="flex flex-1 flex-col gap-1 min-w-0">
      {ADDRESS_PARTS.map((part) => (
        <input
          key={part.key}
          value={address[part.key] ?? ""}
          onChange={(event) => onChange({ ...address, [part.key]: event.target.value })}
          placeholder={part.label}
          className="liquid-input !h-7 !text-[12px]"
        />
      ))}
    </div>
  );
}

function ComplianceEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: { standard: string; status: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3">
      {SUPPORTED_STANDARDS.map((standard) => {
        const current = complianceStatus(value, standard);
        return (
          <div key={standard} className="flex items-center justify-between gap-3">
            <span
              className="text-[12px] leading-[1.35]"
              style={{ color: "rgba(235,235,245,0.7)" }}
            >
              {standard}
            </span>
            <GlassSelect
              value={current}
              onChange={(next) => {
                const specs = Array.isArray(value) ? value : [];
                const merged = SUPPORTED_STANDARDS.map((entry) => ({
                  standard: entry,
                  status:
                    entry === standard
                      ? next
                      : complianceStatus(specs, entry),
                })).filter((spec) => spec.status);
                onChange(merged);
              }}
              options={COMPLIANCE_STATUSES.map((status) => ({ value: status, label: status }))}
              placeholder="—"
              ariaLabel={`${standard} uyumluluk durumu`}
              className="!h-7 !w-[136px] !shrink-0 !px-2 !text-[11.5px] !text-right"
            />
          </div>
        );
      })}
    </div>
  );
}

export function NodeEdit({
  node,
  draft,
  onChange,
  onRemoveKey,
  onSave,
  refOptions,
}: {
  node: StudioNode;
  draft: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onRemoveKey: (key: string) => void;
  onSave: () => void;
  refOptions: RefOptions;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const defs = NODE_FIELDS[node.type];
  const knownKeys = useMemo(() => new Set(defs.map((field) => field.key)), [defs]);
  const fields = defs.filter((field) => !field.vault && field.type !== "compliance");
  const vaultFields = defs.filter(
    (field) => field.vault && field.type !== "compliance" && field.type !== "boolean",
  );
  const vaultBoolean = defs.find(
    (field) => field.vault && field.type === "boolean",
  );
  const complianceField = defs.find((field) => field.type === "compliance");
  const customEntries = Object.entries(draft).filter(
    ([key]) =>
      !knownKeys.has(key) &&
      key !== "case_files" &&
      key !== "case_notes" &&
      key !== "case_folders" &&
      key !== "case_clients" &&
      key !== "case_precedents",
  );

  const canAdd = newKey.trim().length > 0 && !knownKeys.has(newKey.trim());

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section>
        <div className="liquid-section-label">
          <span>Nitelikler</span>
        </div>
        <div className="liquid-group">
          {fields.map((field) => (
            <div
              key={field.key}
              className={
                field.type === "address" || field.type === "parties" || field.type === "textarea"
                  ? "liquid-row !items-start !px-3.5"
                  : "liquid-row !px-3.5"
              }
            >
              <span className="liquid-row-label w-[104px] shrink-0 pt-0.5">{field.label}</span>
              {field.type === "address" ? (
                <AddressEditor
                  value={draft[field.key]}
                  onChange={(next) => onChange(field.key, next)}
                />
              ) : (
                <FieldInput
                  field={field}
                  value={draft[field.key]}
                  record={draft}
                  onChange={(next) => {
                    onChange(field.key, next);
                    if (field.key === "jurisdiction_code") {
                      const courts = courtsFor(String(next));
                      const families = familiesFor(String(next));
                      onChange("court_id", courts[0]?.id || "");
                      onChange("court", courts[0]?.labelTr || "");
                      onChange("procedure_family", families[0] || "");
                    }
                    if (field.key === "court_id") {
                      const court = courtsFor(String(draft.jurisdiction_code || "TR")).find(
                        (item) => item.id === next,
                      );
                      if (court) onChange("court", court.labelTr);
                    }
                  }}
                  refOptions={refOptions}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {(vaultBoolean || vaultFields.length > 0 || complianceField) && (
        <section>
          <div className="liquid-section-label">
            <span>ZenVault</span>
          </div>
          <div className="liquid-group">
            {vaultBoolean && (
              <div className="liquid-row !px-3.5">
                <span className="liquid-row-label w-[104px] shrink-0">{vaultBoolean.label}</span>
                <FieldInput
                  field={vaultBoolean}
                  value={draft[vaultBoolean.key]}
                  onChange={(next) => onChange(vaultBoolean.key, next)}
                  refOptions={refOptions}
                />
              </div>
            )}
            {vaultFields.map((field) => (
              <div key={field.key} className="liquid-row !px-3.5">
                <span className="liquid-row-label w-[104px] shrink-0">{field.label}</span>
                <FieldInput
                  field={field}
                  value={draft[field.key]}
                  onChange={(next) => onChange(field.key, next)}
                  refOptions={refOptions}
                />
              </div>
            ))}
            {complianceField && (
              <div>
                <div className="liquid-row !px-3.5 !min-h-0 !py-2.5">
                  <span className="liquid-row-label">{complianceField.label}</span>
                </div>
                <ComplianceEditor
                  value={draft[complianceField.key]}
                  onChange={(next) => onChange(complianceField.key, next)}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {customEntries.length > 0 && (
        <section>
          <div className="liquid-section-label">
            <span>Ek alanlar</span>
            <span className="font-mono text-[10px] normal-case tracking-[0.01em] text-white/50">
              {customEntries.length}
            </span>
          </div>
          <div className="liquid-group">
            {customEntries.map(([key, value]) => (
              <div key={key} className="liquid-row group/row !gap-2.5 !px-3.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="text-[12.5px] shrink-0 tracking-[0.005em]"
                    style={{ color: "rgba(235,235,245,0.66)" }}
                  >
                    {key}
                  </span>
                  <span className="text-[13px] truncate text-white/95 tracking-[0.005em]">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveKey(key)}
                  title="Alanı Sil"
                  className="p-1 rounded-[6px] opacity-0 group-hover/row:opacity-100 hover:bg-white/[0.07] active:scale-95 transition-all shrink-0"
                  style={{ color: "rgba(255,69,58,0.8)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="liquid-group p-2 flex items-center gap-1.5 bg-black/20">
        <input
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          placeholder="Anahtar"
          className="liquid-input !h-7 !text-[12px] flex-1"
        />
        <input
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          placeholder="Değer"
          className="liquid-input !h-7 !text-[12px] flex-1"
        />
        <button
          type="button"
          onClick={() => {
            if (!canAdd) return;
            onChange(newKey.trim(), newValue);
            setNewKey("");
            setNewValue("");
          }}
          disabled={!canAdd}
          className="liquid-tool !h-7 !px-2.5 disabled:opacity-40 shrink-0"
        >
          Ekle
        </button>
      </div>

      <button type="button" onClick={onSave} className="liquid-primary w-full">
        <Save className="w-3.5 h-3.5" /> Değişiklikleri Kaydet
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vault                                                              */
/* ------------------------------------------------------------------ */

function complianceTone(status: string) {
  switch (status) {
    case "Compliant":
      return { color: apple.success, background: "rgba(48,209,88,0.12)" };
    case "Supported":
      return { color: apple.primaryOnDark, background: "rgba(10,132,255,0.14)" };
    case "Archival":
      return { color: apple.warning, background: "rgba(255,159,10,0.12)" };
    default:
      return { color: "rgba(235,235,245,0.42)", background: "rgba(255,255,255,0.05)" };
  }
}

export function NodeVault({ node }: { node: StudioNode }) {
  const data = nodeDataRecord(node);
  const specs = data.compliance_specs;

  const checksum = typeof data.checksum === "string" ? data.checksum : "";
  const cipher = typeof data.cipher === "string" ? data.cipher : "";
  const seal = typeof data.seal_status === "string" ? data.seal_status : "";

  const verified =
    node.type === "entity"
      ? data.zenvault_verified
      : node.type === "dossier"
        ? data.zenvault_secured
        : undefined;

  const verificationLabel =
    verified === true ? "Doğrulandı" : verified === false ? "Doğrulanmadı" : "Tanımlı değil";

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section>
        <div className="liquid-section-label">
          <span>ZenVault</span>
        </div>
        <div className="liquid-group">
          <div className="liquid-row">
            <span className="liquid-row-label">Doğrulama</span>
            <CopyText
              text={verificationLabel}
              align="end"
              className="liquid-row-value text-[12.5px]"
              style={emptyStyle(verified === undefined)}
            />
          </div>
          <div className="liquid-row">
            <span className="liquid-row-label">Şifreleme</span>
            <CopyText
              text={cipher || EMPTY}
              align="end"
              className="liquid-row-value text-[12.5px]"
              style={emptyStyle(!cipher)}
            />
          </div>
          <div className="liquid-row">
            <span className="liquid-row-label">Mühür</span>
            <CopyText
              text={seal || EMPTY}
              align="end"
              className="liquid-row-value text-[12.5px]"
              style={emptyStyle(!seal)}
            />
          </div>
          <div className="liquid-row !items-start">
            <span className="liquid-row-label pt-0.5">Checksum</span>
            <CopyText
              text={checksum || EMPTY}
              align="end"
              multiline
              className="liquid-row-value max-w-[70%] font-mono text-[11.5px] leading-[1.45]"
              textClassName="break-all whitespace-normal"
              style={{ color: checksum ? "rgba(255,255,255,0.9)" : "rgba(235,235,245,0.32)" }}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="liquid-section-label">
          <span>Uyumluluk</span>
        </div>
        <div className="liquid-group">
          {SUPPORTED_STANDARDS.map((standard) => {
            const status = complianceStatus(specs, standard);
            const tone = complianceTone(status);
            return (
              <div key={standard} className="liquid-row !py-2.5">
                <span className="liquid-row-label text-[12.5px] leading-[1.35]">{standard}</span>
                <CopyText text={status || "Doğrulanmadı"} align="end">
                  <span
                    className="shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-medium tracking-[0.01em]"
                    style={{ color: tone.color, backgroundColor: tone.background }}
                  >
                    {status || "Doğrulanmadı"}
                  </span>
                </CopyText>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export { FieldInput };
