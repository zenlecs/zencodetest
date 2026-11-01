import crypto from "crypto";
import zlib from "zlib";

export interface UdfParseResult {
  title: string;
  bodyText: string;
  properties: Record<string, string>;
  signed: boolean;
  checksum: string;
}

/** Reads a ZIP local-file directory. UDF and DOCX are both ZIP containers. */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.slice(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = buffer.slice(dataStart, dataStart + compSize);
    let data = Buffer.alloc(0);
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    if (name && !name.endsWith("/")) files.set(name.replace(/\\/g, "/"), data);
    offset = dataStart + compSize;
  }
  return files;
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function tagText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

/** UYAP UDF: content.xml holds offset-addressed text, plus properties and an optional signature. */
export function parseUdfZip(buffer: Buffer): UdfParseResult {
  const files = unzip(buffer);
  const content = files.get("content.xml")?.toString("utf8") || "";
  const propertiesXml = files.get("documentproperties.xml")?.toString("utf8") || "";
  const signed = files.has("sign.sgn");
  const properties: Record<string, string> = {};
  for (const key of ["title", "subject", "creator", "description"]) {
    const value = tagText(propertiesXml, key);
    if (value) properties[key] = value;
  }

  const cdata = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  const source = cdata ? cdata[1] : content.replace(/<[^>]+>/g, "");
  const slices: string[] = [];
  const element = /<(?:paragraph|element|content)[^>]*startOffset="(\d+)"[^>]*length="(\d+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = element.exec(content))) {
    const start = Number(match[1]);
    const length = Number(match[2]);
    if (Number.isFinite(start) && length > 0 && start + length <= source.length) {
      slices.push(source.slice(start, start + length));
    }
  }
  const bodyText = (slices.length ? slices.join("\n") : source).replace(/\s+\n/g, "\n").trim();
  return {
    title: properties.title || "UDF belge",
    bodyText,
    properties,
    signed,
    checksum: sha256(buffer),
  };
}

export function extractDocxText(buffer: Buffer): string {
  const files = unzip(buffer);
  const xml = files.get("word/document.xml")?.toString("utf8") || "";
  return xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pulls literal strings from a PDF. This is not OCR. */
export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];
  const literal = /\((?:\\\)|[^)]){2,}\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(raw)) && parts.length < 400) {
    const text = match[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\\)/g, ")")
      .replace(/\\\(/g, "(");
    if (/[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(text)) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
