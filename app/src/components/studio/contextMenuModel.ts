import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Calendar,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Link2,
  Mail,
  Play,
  Plug,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  AUTOMATION_NODE_TYPES,
  NODE_TYPE_LABEL,
  type NodeType,
  type StudioNode,
} from "./types";

export type MenuCtx =
  | { kind: "canvas"; x: number; y: number; canvasX: number; canvasY: number }
  | { kind: "node"; x: number; y: number; canvasX: number; canvasY: number; nodeId: string; nodeType: NodeType };

export type MenuItem =
  | {
      type: "action";
      id: string;
      label: string;
      icon?: LucideIcon;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
    }
  | { type: "group"; id: string; label: string; icon?: LucideIcon; children: MenuItem[] }
  | { type: "separator"; id: string };

const CASE_TYPES: NodeType[] = ["entity", "matter", "dossier", "hearing", "deadline", "agent"];

export const CONNECTOR_CHOICES = [
  { id: "danistay", label: "Danıştay" },
  { id: "uyap-emsal", label: "UYAP Emsal" },
  { id: "aym", label: "AYM" },
  { id: "gmail", label: "Gmail" },
  { id: "outlook", label: "Outlook" },
] as const;

const AUTOMATION = new Set<NodeType>(AUTOMATION_NODE_TYPES);

function action(
  id: string,
  label: string,
  extra?: Partial<Extract<MenuItem, { type: "action" }>>,
): MenuItem {
  return { type: "action", id, label, ...extra };
}

function group(id: string, label: string, children: MenuItem[], icon?: LucideIcon): MenuItem {
  return { type: "group", id, label, icon, children };
}

function precedentGroup(label = "Emsal ara"): MenuItem {
  return group("precedent", label, [
    action("precedent.danistay", "Danıştay", { icon: Search }),
    action("precedent.uyap-emsal", "UYAP Emsal", { icon: Search }),
    action("precedent.aym", "AYM", { icon: Search }),
    action("precedent.all", "Hepsi", { icon: Search }),
    action("precedent.advanced", "Gelişmiş…", { icon: Search }),
  ], Search);
}

function connectorGroup(idPrefix: string): MenuItem {
  return group(
    "connector-pick",
    "Bağlantı",
    CONNECTOR_CHOICES.map((item) => action(`${idPrefix}.${item.id}`, item.label, { icon: Plug })),
    Plug,
  );
}

export function getCanvasMenu(): MenuItem[] {
  return [
    group("new-node", "Yeni düğüm", [
      group(
        "case-graph",
        "Dava grafiği",
        [
          ...CASE_TYPES.filter((type) => type !== "dossier").map((type) =>
            action(`node.create.${type}`, NODE_TYPE_LABEL[type]),
          ),
          action("matter.addFile", "Evrak ekle", { icon: Upload }),
        ],
        FolderOpen,
      ),
      group("automation", "Otomasyon", [
        action("node.create.trigger", NODE_TYPE_LABEL.trigger),
        connectorGroup("node.connector"),
        ...AUTOMATION_NODE_TYPES.filter((type) => type !== "connector" && type !== "trigger").map((type) =>
          action(`node.create.${type}`, NODE_TYPE_LABEL[type]),
        ),
      ], Bot),
    ], FolderOpen),
    action("ingest.open", "Belge içe aktar", { icon: Upload }),
    group("templates", "Şablonlar", [
      action("template.precedent", "Emsal izleme akışı", { icon: Search }),
      action("template.defense", "Savunma taslağı akışı", { icon: FileText }),
      action("template.deadlines", "Süre motoru", { icon: Calendar }),
      action("template.statute", "Mevzuat izleme", { icon: FileText, disabled: true, hint: "yakında" }),
    ]),
    group("connect", "Bağlantılar", [
      ...CONNECTOR_CHOICES.filter((item) => item.id !== "gmail" && item.id !== "outlook").map((item) =>
        action(`node.connector.${item.id}`, item.label, { icon: Plug }),
      ),
      action("connect.mevzuat", "Mevzuat", { disabled: true, hint: "yakında" }),
      action("connect.gazette", "Resmî Gazete", { disabled: true, hint: "yakında" }),
      action("connect.mail.gmail", "Gmail", { icon: Mail, hint: "Bağla…" }),
      action("connect.mail.outlook", "Outlook", { icon: Mail, hint: "Bağla…" }),
      action("connect.drive", "Drive", { disabled: true, hint: "yakında" }),
      action("connect.onedrive", "OneDrive", { disabled: true, hint: "yakında" }),
    ], Plug),
    group("canvas", "Tuval", [
      action("canvas.selectAll", "Tümünü seç"),
      action("canvas.paste", "Yapıştır"),
      action("canvas.import", "İçe aktar JSON", { icon: Upload }),
      action("canvas.export", "Dışa aktar", { icon: Download }),
      action("canvas.clear", "Temizle…", { danger: true }),
    ]),
  ];
}

export function getNodeMenu(node: StudioNode): MenuItem[] {
  const items: MenuItem[] = [
    action("node.inspect", "İncele", { icon: Eye }),
    action("node.link", "Düğüme bağla…", { icon: Link2 }),
  ];

  if (node.type === "agent") {
    items.push(
      group("agent-run", "Ajan", [
        action("node.run", "Şimdi çalıştır", { icon: Play }),
        action("agent.stop", "İzlemeyi durdur"),
        action("node.settings", "Bağlı akışı düzenle"),
        action("agent.log", "Son run logu"),
      ], Bot),
    );
  } else if (AUTOMATION.has(node.type)) {
    items.push(action("node.run", "Çalıştır", { icon: Play }));
    items.push(
      group("step", "Adım", [
        action("step.run", "Bu adımı çalıştır", { icon: Play }),
        action("step.from", "Buradan itibaren çalıştır"),
        action("step.dry", "Test"),
        group("ports", "Porta bağla", [
          action("port.docs", "docs"),
          action("port.decisions", "decisions"),
          action("port.matterRef", "matterRef"),
          action("port.text", "text"),
          action("port.deadlines", "deadlines"),
        ]),
        action("node.settings", "Ayarlar"),
      ]),
    );
  }

  items.push(action("node.duplicate", "Çoğalt", { icon: Copy }));
  items.push({ type: "separator", id: "sep-actions" });

  if (node.type === "matter") {
    items.splice(1, 0, action("matter.addFile", "Evrak ekle", { icon: Upload }));
    items.push(
      group("actions", "Aksiyonlar", [
        precedentGroup(),
        action("defense.draft", "Savunma / cevap taslağı", { icon: FileText }),
        action("deadlines.open", "Süreleri hesapla…", { icon: Calendar }),
        action("presentation.brief", "Sunum özeti"),
      ]),
      group("watch", "Otomasyon", [
        action("template.precedent", "Bu dava için emsal izleme akışı ekle"),
        action("template.statute", "Mevzuat değişikliği izle", { disabled: true, hint: "yakında" }),
      ], Bot),
      group("links", "Bağlantılar", [
        action("precedent.danistay", "Danıştay’da ara", { icon: Search }),
        action("precedent.uyap-emsal", "Yargıtay / Emsal", { icon: Search }),
        action("precedent.aym", "AYM", { icon: Search }),
        action("mail.attach.gmail", "Gmail’den dosyaya ekle…", { icon: Mail }),
      ], Plug),
    );
  }

  if (node.type === "dossier") {
    items.push(
      group("actions", "Aksiyonlar", [
        precedentGroup("Emsal ara (bu belgeye göre)"),
        action("dossier.parse", "Metni çıkar / UDF aç", { icon: FileText }),
        action("defense.add", "Savunma taslağına ekle"),
        action("citation.check", "Atıfları doğrula"),
        action("vault.open", "ZenVault’ta aç"),
      ]),
    );
  }

  if (node.type === "deadline") {
    items.push(
      group("actions", "Aksiyonlar", [
        action("deadlines.pin", "Takvime yaz", { icon: Calendar }),
        action("deadline.remind", "Hatırlatıcı"),
        action("deadline.raise", "Önceliği yükselt"),
      ], Calendar),
    );
  }

  if (node.type === "hearing") {
    items.push(
      group("actions", "Aksiyonlar", [
        action("hearing.calendar", "Takvime yaz", { icon: Calendar }),
        action("hearing.checklist", "Öncesi checklist üret"),
      ]),
    );
  }

  if (node.type === "entity") {
    items.push(
      group("actions", "Aksiyonlar", [
        action("entity.link", "Davalara bağla", { icon: Link2 }),
        action("entity.conflict", "Çıkar çatışması notu"),
      ]),
    );
  }

  items.push({ type: "separator", id: "sep-danger" });
  items.push(action("node.delete", "Kaldır", { icon: Trash2, danger: true }));
  return items;
}
