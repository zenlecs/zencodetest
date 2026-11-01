import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Folder, NotebookPen, Upload, User, X } from "lucide-react";
import { apple, appleFont } from "./tokens";
import type {
  CaseClientRecord,
  CaseFileRecord,
  CaseFolderRecord,
  CaseNoteRecord,
  CasePrecedentRecord,
} from "./types";

const FOLDER_COLORS = ["#30d158", "#ff9f0a", "#ff453a", "#bf5af2", "#64d2ff", "#ffd60a", "#2997ff"];

export interface CaseFileFacts {
  docket: string;
  court: string;
  jurisdiction: string;
  procedure: string;
  status: string;
  filed: string;
}

const DEFAULT_FOLDERS: CaseFolderRecord[] = [
  { id: "client", name: "Müvekkil", kind: "client", color: "" },
  { id: "documents", name: "Evraklar", kind: "documents", color: "" },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function blankClient(): CaseClientRecord {
  return {
    id: uid("client"),
    name: "",
    photo: "",
    nationalId: "",
    birthDate: "",
    phone: "",
    email: "",
    address: "",
    occupation: "",
    payments: [],
  };
}

export function normalizeFolders(raw: CaseFolderRecord[] | undefined): CaseFolderRecord[] {
  const extra = (raw || []).filter((folder) => folder.kind !== "client" && folder.kind !== "documents");
  return [...DEFAULT_FOLDERS, ...extra];
}

function belongsToDocuments(file: CaseFileRecord, folder: CaseFolderRecord) {
  return file.folder === folder.id || file.folder === folder.name || file.folder === "Evraklar" || file.folder === "documents";
}

function filesIn(folder: CaseFolderRecord, files: CaseFileRecord[]) {
  if (folder.kind === "documents") return files.filter((file) => belongsToDocuments(file, folder));
  return files.filter((file) => file.folder === folder.id || file.folder === folder.name);
}

function parseAmount(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.src = url;
  });
}

function FolderGlyph({ folder }: { folder: CaseFolderRecord }) {
  if (folder.kind === "client") return <User className="h-4 w-4 shrink-0" style={{ color: "#d2d2d7" }} />;
  if (folder.kind === "notes") return <NotebookPen className="h-4 w-4 shrink-0" style={{ color: apple.parchment }} />;
  const color = folder.kind === "documents" ? apple.primaryOnDark : folder.color || apple.primaryOnDark;
  return <Folder className="h-4 w-4 shrink-0" style={{ color }} />;
}

export function CaseFileExplorer({
  title,
  folders,
  files,
  notes,
  clients,
  precedents,
  facts,
  pickToken,
  onClose,
  onAddFiles,
  onPatch,
}: {
  title: string;
  folders: CaseFolderRecord[];
  files: CaseFileRecord[];
  notes: CaseNoteRecord[];
  clients: CaseClientRecord[];
  precedents: CasePrecedentRecord[];
  facts: CaseFileFacts;
  pickToken: number;
  onClose: () => void;
  onAddFiles: (files: File[], folderId: string) => void;
  onPatch: (patch: {
    case_folders?: CaseFolderRecord[];
    case_files?: CaseFileRecord[];
    case_notes?: CaseNoteRecord[];
    case_clients?: CaseClientRecord[];
    case_precedents?: CasePrecedentRecord[];
  }) => void;
}) {
  const tree = normalizeFolders(folders);
  const [folderId, setFolderId] = useState("documents");
  const [fileId, setFileId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [precedentId, setPrecedentId] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<"identity" | "payments" | "file">("identity");
  const [menu, setMenu] = useState<{ x: number; y: number; folderId: string | null } | null>(null);
  const [pending, setPending] = useState<{ kind: "precedent" | "custom"; name: string } | null>(null);
  const [customName, setCustomName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const picked = useRef(0);
  const folder = tree.find((item) => item.id === folderId) || tree[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) {
        setMenu(null);
        setPending(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, onClose]);

  useEffect(() => {
    if (!pickToken || pickToken === picked.current) return;
    picked.current = pickToken;
    setFolderId("documents");
    inputRef.current?.click();
  }, [pickToken]);

  const openMenu = (event: MouseEvent, target: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setPending(null);
    setCustomName("");
    setMenu({ x: event.clientX, y: event.clientY, folderId: target });
  };

  const persistFolders = (next: CaseFolderRecord[]) => {
    onPatch({ case_folders: next.filter((item) => item.kind !== "client" && item.kind !== "documents") });
  };

  const addFolder = (name: string, kind: CaseFolderRecord["kind"], color: string) => {
    const id = kind === "notes" ? "notes" : uid("folder");
    persistFolders([...tree, { id, name, kind, color }]);
    setFolderId(id);
    setMenu(null);
    setPending(null);
  };

  const removeFolder = (id: string) => {
    const target = tree.find((item) => item.id === id);
    if (!target || target.kind === "client" || target.kind === "documents") return;
    persistFolders(tree.filter((item) => item.id !== id));
    onPatch({
      case_notes: notes.filter((note) => note.folderId !== id),
      case_precedents: precedents.filter((item) => item.folderId !== id),
      case_files: files.filter((file) => file.folder !== id),
    });
    if (folderId === id) setFolderId("documents");
    setMenu(null);
  };

  const hasKind = (kind: CaseFolderRecord["kind"], name?: string) =>
    tree.some((item) => item.kind === kind && (!name || item.name === name));

  const folderNotes = notes.filter((note) => (note.folderId || "notes") === folder.id);
  const folderFiles = filesIn(folder, files);
  const folderPrecedents = precedents.filter((row) => row.folderId === folder.id);
  const selectedClientId = clients.some((person) => person.id === clientId) ? clientId : clients[0]?.id || null;
  const selectedFileId = folderFiles.some((file) => file.id === fileId) ? fileId : folderFiles[0]?.id || null;
  const selectedNoteId = folderNotes.some((note) => note.id === noteId) ? noteId : folderNotes[0]?.id || null;
  const selectedPrecedentId = folderPrecedents.some((row) => row.id === precedentId) ? precedentId : folderPrecedents[0]?.id || null;

  const addCurrent = () => {
    if (folder.kind === "client") {
      const person = blankClient();
      onPatch({ case_clients: [...clients, person] });
      setClientId(person.id);
      setClientTab("identity");
      return;
    }
    if (folder.kind === "documents") {
      inputRef.current?.click();
      return;
    }
    if (folder.kind === "notes" || folder.kind === "custom") {
      const note = { id: uid(folder.kind === "notes" ? "note" : "sheet"), folderId: folder.id, title: "", body: "" };
      onPatch({ case_notes: [note, ...notes] });
      setNoteId(note.id);
      return;
    }
    const row: CasePrecedentRecord = {
      id: uid("emsal"),
      folderId: folder.id,
      citation: "",
      court: "",
      stance: "nötr",
      summary: "",
    };
    onPatch({ case_precedents: [...precedents, row] });
    setPrecedentId(row.id);
  };

  const indexRows: { id: string; label: string }[] =
    folder.kind === "client"
      ? clients.map((person) => ({ id: person.id, label: person.name || "İsimsiz" }))
      : folder.kind === "documents"
        ? folderFiles.map((file) => ({ id: file.id, label: file.title }))
        : folder.kind === "precedent"
          ? folderPrecedents.map((row) => ({ id: row.id, label: row.citation || "Yeni kayıt" }))
          : folderNotes.map((note) => ({ id: note.id, label: note.title || "Başlıksız" }));

  const selectedIndexId =
    folder.kind === "client"
      ? selectedClientId
      : folder.kind === "documents"
        ? selectedFileId
        : folder.kind === "precedent"
          ? selectedPrecedentId
          : selectedNoteId;

  const selectIndex = (id: string) => {
    if (folder.kind === "client") setClientId(id);
    else if (folder.kind === "documents") setFileId(id);
    else if (folder.kind === "precedent") setPrecedentId(id);
    else setNoteId(id);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: appleFont, color: apple.parchment }}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dava dosyası"}
        className="absolute left-1/2 top-1/2 flex h-[85vh] w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border shadow-2xl"
        style={{ background: "rgba(22,22,24,0.96)", borderColor: "rgba(255,255,255,0.12)" }}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (menu) {
            setMenu(null);
            setPending(null);
          }
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: apple.hairline }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-semibold tracking-[-0.02em]">{title || "Dava dosyası"}</div>
            <div className="text-[11px]" style={{ color: apple.inkMuted48 }}>
              {files.length} evrak
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px]"
            style={{ background: apple.primary, color: "#fff" }}
            onClick={() => {
              setFolderId("documents");
              inputRef.current?.click();
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Evrak ekle
          </button>
          <button
            type="button"
            aria-label="Kapat"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.08)" }}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            data-case-file-input="true"
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) onAddFiles(Array.from(event.target.files), "documents");
              event.target.value = "";
            }}
          />
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_240px_minmax(0,1fr)]">
          <aside
            className="min-h-0 overflow-auto border-r p-2"
            style={{ borderColor: apple.hairline }}
            onContextMenu={(event) => openMenu(event, null)}
          >
            {tree.map((item) => {
              const count =
                item.kind === "client"
                  ? clients.length
                  : item.kind === "notes" || item.kind === "custom"
                    ? notes.filter((note) => (note.folderId || "notes") === item.id).length
                    : item.kind === "precedent"
                      ? precedents.filter((row) => row.folderId === item.id).length
                      : filesIn(item, files).length;
              const active = item.id === folder.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="mb-0.5 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
                  style={{ background: active ? "rgba(255,255,255,0.08)" : "transparent" }}
                  onClick={() => {
                    setFolderId(item.id);
                    setFileId(null);
                  }}
                  onContextMenu={(event) => openMenu(event, item.id)}
                  onDragOver={(event) => {
                    if (item.kind === "documents") event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (item.kind !== "documents") return;
                    event.preventDefault();
                    const moved = event.dataTransfer.getData("application/x-zenlecs-file");
                    if (moved) {
                      onPatch({
                        case_files: files.map((file) => (file.id === moved ? { ...file, folder: item.id } : file)),
                      });
                      setFolderId(item.id);
                      return;
                    }
                    if (event.dataTransfer.files?.length) onAddFiles(Array.from(event.dataTransfer.files), item.id);
                  }}
                >
                  <FolderGlyph folder={item} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {count > 0 && (
                    <span className="text-[11px] tabular-nums" style={{ color: apple.inkMuted48 }}>{count}</span>
                  )}
                </button>
              );
            })}
          </aside>

          <section className="flex min-h-0 flex-col border-r" style={{ borderColor: apple.hairline }}>
            <div className="flex h-9 shrink-0 items-center justify-end border-b px-2" style={{ borderColor: apple.hairline }}>
              <button
                type="button"
                aria-label="Ekle"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[18px] leading-none"
                style={{ color: apple.parchment }}
                onClick={addCurrent}
              >
                +
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1">
              {indexRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="block h-8 w-full truncate px-3 text-left text-[13px]"
                  style={{ background: row.id === selectedIndexId ? "rgba(255,255,255,0.08)" : "transparent" }}
                  onClick={() => selectIndex(row.id)}
                >
                  {row.label}
                </button>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col">
            {folder.kind === "client" && (
              <ClientPane
                clients={clients}
                clientId={selectedClientId}
                tab={clientTab}
                facts={facts}
                onTab={setClientTab}
                onChange={(next) => onPatch({ case_clients: next })}
              />
            )}
            {folder.kind === "documents" && (
              <DocumentPane
                file={folderFiles.find((file) => file.id === selectedFileId) || null}
                onRemove={(id) => onPatch({ case_files: files.filter((file) => file.id !== id) })}
              />
            )}
            {folder.kind === "notes" && (
              <NotePane
                note={folderNotes.find((note) => note.id === selectedNoteId) || null}
                onChange={(next) => {
                  const others = notes.filter((note) => (note.folderId || "notes") !== folder.id);
                  onPatch({ case_notes: [...others, ...next] });
                }}
                notes={folderNotes}
              />
            )}
            {folder.kind === "precedent" && (
              <PrecedentPane
                row={folderPrecedents.find((row) => row.id === selectedPrecedentId) || null}
                onChange={(next) => {
                  const others = precedents.filter((row) => row.folderId !== folder.id);
                  onPatch({ case_precedents: [...others, ...next] });
                }}
                rows={folderPrecedents}
              />
            )}
            {folder.kind === "custom" && (
              <CustomPane
                note={folderNotes.find((note) => note.id === selectedNoteId) || null}
                onChange={(next) => {
                  const others = notes.filter((note) => note.folderId !== folder.id);
                  onPatch({ case_notes: [...others, ...next] });
                }}
                notes={folderNotes}
              />
            )}
          </section>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-[120] w-[220px] rounded-[12px] border p-1 shadow-xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 236),
            top: Math.min(menu.y, window.innerHeight - 220),
            background: "rgba(29,29,31,0.96)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {pending ? (
            <div className="px-2 py-2">
              <div className="mb-2 text-[12px]" style={{ color: apple.inkMuted48 }}>{pending.name}</div>
              {pending.kind === "custom" && (
                <input
                  autoFocus
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="Klasör adı"
                  className="mb-2 w-full bg-transparent text-[13px] outline-none"
                />
              )}
              <div className="flex gap-1.5">
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    className="h-4 w-4 rounded-full"
                    style={{ background: color }}
                    onClick={() => {
                      const name = pending.kind === "custom" ? customName.trim() || "Klasör" : pending.name;
                      addFolder(name, pending.kind, color);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {menu.folderId && menu.folderId !== "client" && menu.folderId !== "documents" && (
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]"
                  style={{ color: apple.danger }}
                  onClick={() => removeFolder(menu.folderId!)}
                >
                  Klasörü kaldır
                </button>
              )}
              {!hasKind("notes") && (
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]"
                  onClick={() => addFolder("Notlar", "notes", "")}
                >
                  Notlar
                </button>
              )}
              {!hasKind("precedent", "Emsaller") && (
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]"
                  onClick={() => setPending({ kind: "precedent", name: "Emsaller" })}
                >
                  Emsaller
                </button>
              )}
              {!hasKind("precedent", "İçtihatlar") && (
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]"
                  onClick={() => setPending({ kind: "precedent", name: "İçtihatlar" })}
                >
                  İçtihatlar
                </button>
              )}
              <button
                type="button"
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]"
                onClick={() => setPending({ kind: "custom", name: "Yeni klasör" })}
              >
                Yeni klasör
              </button>
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ClientPane({
  clients,
  clientId,
  tab,
  facts,
  onTab,
  onChange,
}: {
  clients: CaseClientRecord[];
  clientId: string | null;
  tab: "identity" | "payments" | "file";
  facts: CaseFileFacts;
  onTab: (tab: "identity" | "payments" | "file") => void;
  onChange: (next: CaseClientRecord[]) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const active = clients.find((person) => person.id === clientId) || null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CaseClientRecord | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const shown = editing && draft ? draft : active;

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setConfirmRemove(false);
  }, [clientId]);

  useEffect(() => {
    if (!confirmRemove) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setConfirmRemove(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirmRemove]);

  const update = (patch: Partial<CaseClientRecord>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  if (!shown) {
    return <div className="px-5 py-4 text-[13px]" style={{ color: apple.inkMuted48 }}>Müvekkil yok.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-5 pt-5">
        <div className="flex max-w-[420px] items-center gap-3">
          <button
            type="button"
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{ background: "#2a2a2c" }}
            onClick={() => editing && photoRef.current?.click()}
          >
            {shown.photo ? (
              <img src={shown.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6" style={{ color: "#8e8e93" }} />
            )}
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !editing) return;
              void readPhoto(file).then((photo) => update({ photo }));
            }}
          />
          {editing ? (
            <input
              value={shown.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Ad soyad"
              className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tracking-[-0.02em] outline-none"
            />
          ) : (
            <div className="truncate text-[18px] font-semibold tracking-[-0.02em]">{shown.name || "İsimsiz"}</div>
          )}
        </div>

        <div className="mt-4 flex max-w-[420px] gap-5 border-b" style={{ borderColor: apple.hairline }}>
          {(
            [
              ["identity", "Kimlik"],
              ["payments", "Ödemeler"],
              ["file", "Dosya"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="pb-2 text-[13px]"
              style={{
                color: tab === id ? apple.parchment : apple.inkMuted48,
                boxShadow: tab === id ? "inset 0 -1px 0 #f5f5f7" : undefined,
              }}
              onClick={() => onTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-w-[420px] py-4">
          {tab === "identity" && (
            <div className="liquid-group">
              <Field label="T.C. kimlik no" value={shown.nationalId} editing={editing} inset copyable={!editing && shown.nationalId.trim().length > 0} onChange={(nationalId) => update({ nationalId })} />
              <Field label="Doğum tarihi" value={shown.birthDate} editing={editing} inset onChange={(birthDate) => update({ birthDate })} />
              <Field label="Telefon" value={shown.phone} editing={editing} inset onChange={(phone) => update({ phone })} />
              <Field label="E-posta" value={shown.email} editing={editing} inset onChange={(email) => update({ email })} />
              <Field label="Meslek" value={shown.occupation} editing={editing} inset onChange={(occupation) => update({ occupation })} />
              <Field label="Adres" value={shown.address} editing={editing} copyable={!editing && shown.address.trim().length > 0} multiline onChange={(address) => update({ address })} />
            </div>
          )}
          {tab === "payments" && (
            <Payments
              rows={shown.payments}
              editing={editing}
              onChange={(payments) => update({ payments })}
            />
          )}
          {tab === "file" && (
            <div className="liquid-group">
              <ReadRow label="Esas no" value={facts.docket} />
              <ReadRow label="Mahkeme" value={facts.court} />
              <ReadRow label="Yargı" value={facts.jurisdiction} />
              <ReadRow label="Usul" value={facts.procedure} />
              <ReadRow label="Durum" value={facts.status} />
              <ReadRow label="Açılış" value={facts.filed} />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-5 py-3">
        <button
          type="button"
          className="text-[13px]"
          style={{ color: apple.danger }}
          onClick={() => setConfirmRemove(true)}
        >
          Kaldır
        </button>
        <div className="flex gap-4">
          <button
            type="button"
            className="text-[13px]"
            style={{ color: editing ? apple.inkMuted48 : apple.parchment }}
            onClick={() => {
              if (!active || editing) return;
              setDraft({ ...active, payments: active.payments.map((row) => ({ ...row })) });
              setEditing(true);
            }}
          >
            Düzenle
          </button>
          <button
            type="button"
            className="text-[13px]"
            style={{ color: editing ? apple.primaryOnDark : apple.inkMuted48 }}
            onClick={() => {
              if (!draft) return;
              onChange(clients.map((person) => (person.id === draft.id ? draft : person)));
              setEditing(false);
              setDraft(null);
            }}
          >
            Kaydet
          </button>
        </div>
      </div>
      {confirmRemove &&
        createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center" style={{ fontFamily: appleFont, color: apple.parchment }}>
            <div className="absolute inset-0 bg-black/45" onClick={() => setConfirmRemove(false)} />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="client-remove-title"
              className="relative w-[320px] rounded-[16px] border p-4 shadow-2xl"
              style={{ background: "rgba(29,29,31,0.98)", borderColor: "rgba(255,255,255,0.12)" }}
            >
              <div id="client-remove-title" className="text-[15px] font-semibold tracking-[-0.02em]">
                Müvekkil kaldırılsın mı?
              </div>
              <p className="mt-1.5 text-[13px] leading-5" style={{ color: apple.bodyMuted }}>
                {shown.name.trim() || "İsimsiz"} profili ve ödeme kayıtları dosyadan silinir.
              </p>
              <div className="mt-4 flex justify-end gap-4">
                <button type="button" className="text-[13px]" style={{ color: apple.parchment }} onClick={() => setConfirmRemove(false)}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="text-[13px]"
                  style={{ color: apple.danger }}
                  onClick={() => {
                    onChange(clients.filter((person) => person.id !== shown.id));
                    setEditing(false);
                    setDraft(null);
                    setConfirmRemove(false);
                  }}
                >
                  Kaldır
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const VALUE_INSET = "calc(2ch + 12px)";

function valueWidth(copyable?: boolean, inset?: boolean) {
  if (inset) return "calc(100% - 2ch - 12px)";
  if (copyable) return "calc(100% - 2ch)";
  return "100%";
}

function EndSlot({ copyable, inset, value }: { copyable?: boolean; inset?: boolean; value: string }) {
  if (inset && copyable) {
    return (
      <>
        <span className="w-3 shrink-0" />
        <CopyValue value={value} />
      </>
    );
  }
  if (inset) return <span className="shrink-0" style={{ width: VALUE_INSET }} aria-hidden />;
  if (copyable) return <CopyValue value={value} />;
  return null;
}

function Field({
  label,
  value,
  onChange,
  multiline,
  editing,
  copyable,
  inset,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  editing: boolean;
  copyable?: boolean;
  inset?: boolean;
}) {
  if (!editing) return <ReadRow label={label} value={value} copyable={copyable} inset={inset} />;
  const className = "min-w-0 bg-transparent text-right text-[13px] outline-none placeholder:text-[#636366]";
  const fieldStyle = { width: valueWidth(copyable, inset) };
  return (
    <div className="liquid-row !px-3.5">
      <span className="liquid-row-label">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end">
        {multiline ? (
          <textarea value={value} rows={2} onChange={(event) => onChange(event.target.value)} placeholder="—" style={fieldStyle} className={`${className} resize-none`} />
        ) : (
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="—" style={fieldStyle} className={className} />
        )}
        <EndSlot copyable={copyable} inset={inset} value={value} />
      </div>
    </div>
  );
}

function ReadRow({ label, value, copyable, inset }: { label: string; value: string; copyable?: boolean; inset?: boolean }) {
  return (
    <div className="liquid-row !px-3.5">
      <span className="liquid-row-label">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end">
        <span className="flex min-w-0 items-center justify-end overflow-hidden" style={{ width: valueWidth(copyable, inset) }}>
          <span className="liquid-row-value shrink-0 whitespace-nowrap">{value || "—"}</span>
        </span>
        <EndSlot copyable={copyable} inset={inset} value={value} />
      </div>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const text = value.trim();
  return (
    <button
      type="button"
      aria-label="Kopyala"
      title={copied ? "Kopyalandı" : "Kopyala"}
      className="flex w-[2ch] shrink-0 items-center justify-center"
      style={{ color: copied ? apple.success : apple.inkMuted48 }}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!text) return;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" strokeWidth={2.4} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
    </button>
  );
}

function Payments({
  rows,
  editing,
  onChange,
}: {
  rows: CaseClientRecord["payments"];
  editing: boolean;
  onChange: (rows: CaseClientRecord["payments"]) => void;
}) {
  const [draft, setDraft] = useState({ date: "", amount: "", description: "" });
  const total = rows.reduce((sum, row) => sum + (parseAmount(row.amount) || 0), 0);
  const any = rows.some((row) => parseAmount(row.amount) !== null);
  return (
    <div className="w-[420px] max-w-full">
      <div className="grid grid-cols-[88px_1fr_84px_20px] gap-2 border-b pb-1 text-[11px]" style={{ borderColor: apple.hairline, color: apple.inkMuted48 }}>
        <span>Tarih</span>
        <span>Açıklama</span>
        <span className="text-right">Tutar</span>
        <span />
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[88px_1fr_84px_20px] gap-2 border-b py-1.5 text-[13px]" style={{ borderColor: apple.hairline }}>
          <span className="truncate">{row.date || "—"}</span>
          <span className="truncate">{row.description || "—"}</span>
          <span className="text-right tabular-nums">{row.amount || "—"}</span>
          {editing ? (
            <button
              type="button"
              aria-label="Ödemeyi sil"
              style={{ color: apple.inkMuted48 }}
              onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
            >
              ×
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {!rows.length && <div className="py-2 text-[13px]" style={{ color: apple.inkMuted48 }}>Ödeme yok.</div>}
      {editing && (
        <form
          className="mt-2 grid grid-cols-[88px_1fr_84px_20px] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.amount.trim() && !draft.description.trim()) return;
            onChange([...rows, { id: uid("pay"), ...draft }]);
            setDraft({ date: "", amount: "", description: "" });
          }}
        >
          <input value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} placeholder="Tarih" className="bg-transparent text-[13px] outline-none" />
          <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Açıklama" className="bg-transparent text-[13px] outline-none" />
          <input value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="Tutar" className="bg-transparent text-right text-[13px] outline-none" />
          <button type="submit" className="text-[13px]" style={{ color: apple.primaryOnDark }}>+</button>
        </form>
      )}
      {any && (
        <div className="mt-3 text-right text-[13px] tabular-nums">
          <span style={{ color: apple.inkMuted48 }}>Toplam </span>
          {total.toLocaleString("tr-TR")}
        </div>
      )}
    </div>
  );
}

function DocumentPane({
  file,
  onRemove,
}: {
  file: CaseFileRecord | null;
  onRemove: (id: string) => void;
}) {
  if (!file) {
    return <div className="px-5 py-4 text-[13px]" style={{ color: apple.inkMuted48 }}>Evrak yok.</div>;
  }
  return (
    <div className="flex min-h-0 max-w-[520px] flex-1 flex-col px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="truncate text-[15px] font-medium">{file.title}</div>
        <button type="button" className="text-[12px]" style={{ color: apple.inkMuted48 }} onClick={() => onRemove(file.id)}>
          Kaldır
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-[13px] leading-6" style={{ color: apple.bodyMuted }}>
        {file.preview || "Bu dosyadan metin çıkmadı."}
      </div>
    </div>
  );
}

function NotePane({
  note,
  notes,
  onChange,
}: {
  note: CaseNoteRecord | null;
  notes: CaseNoteRecord[];
  onChange: (next: CaseNoteRecord[]) => void;
}) {
  if (!note) {
    return <div className="px-5 py-4 text-[13px]" style={{ color: apple.inkMuted48 }}>Not yok.</div>;
  }
  const update = (patch: Partial<CaseNoteRecord>) => {
    onChange(notes.map((item) => (item.id === note.id ? { ...item, ...patch } : item)));
  };
  return (
    <div className="flex min-h-0 max-w-[520px] flex-1 flex-col">
      <input
        value={note.title || ""}
        onChange={(event) => update({ title: event.target.value })}
        placeholder="Başlık"
        className="border-b bg-transparent px-5 py-3 text-[15px] font-medium outline-none"
        style={{ borderColor: apple.hairline }}
      />
      <textarea
        value={note.body}
        onChange={(event) => update({ body: event.target.value })}
        placeholder="Not"
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-3 text-[13px] leading-6 outline-none"
      />
    </div>
  );
}

function PrecedentPane({
  row,
  rows,
  onChange,
}: {
  row: CasePrecedentRecord | null;
  rows: CasePrecedentRecord[];
  onChange: (next: CasePrecedentRecord[]) => void;
}) {
  if (!row) {
    return <div className="px-5 py-4 text-[13px]" style={{ color: apple.inkMuted48 }}>Kayıt yok.</div>;
  }
  const update = (patch: Partial<CasePrecedentRecord>) => {
    onChange(rows.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
  };
  return (
    <div className="max-w-[420px] px-5 py-4">
      <div className="liquid-group">
        <Field label="Karar" value={row.citation} editing onChange={(citation) => update({ citation })} />
        <Field label="Mahkeme" value={row.court} editing onChange={(court) => update({ court })} />
        <Field label="Özet" value={row.summary} editing onChange={(summary) => update({ summary })} multiline />
      </div>
      <div className="mt-3 flex gap-3 text-[13px]">
        {(["lehte", "aleyhte", "nötr"] as const).map((stance) => (
          <button
            key={stance}
            type="button"
            style={{ color: row.stance === stance ? (stance === "lehte" ? apple.success : stance === "aleyhte" ? apple.danger : apple.parchment) : apple.inkMuted48 }}
            onClick={() => update({ stance })}
          >
            {stance}
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomPane({
  note,
  notes,
  onChange,
}: {
  note: CaseNoteRecord | null;
  notes: CaseNoteRecord[];
  onChange: (next: CaseNoteRecord[]) => void;
}) {
  if (!note) {
    return <div className="px-5 py-4 text-[13px]" style={{ color: apple.inkMuted48 }}>Kayıt yok.</div>;
  }
  const update = (patch: Partial<CaseNoteRecord>) => {
    onChange(notes.map((item) => (item.id === note.id ? { ...item, ...patch } : item)));
  };
  return (
    <div className="flex min-h-0 max-w-[420px] flex-1 flex-col px-5 py-4">
      <input
        value={note.title || ""}
        onChange={(event) => update({ title: event.target.value })}
        placeholder="Başlık"
        className="bg-transparent text-[15px] font-medium outline-none"
      />
      <textarea
        value={note.body}
        onChange={(event) => update({ body: event.target.value })}
        placeholder="Metin"
        className="mt-3 min-h-0 flex-1 resize-none bg-transparent text-[13px] leading-6 outline-none"
      />
    </div>
  );
}
