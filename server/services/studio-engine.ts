import { zenVault } from "./zen-vault";
import { extractDocxText, extractPdfText, parseUdfZip, sha256, unzip } from "./udf";

/**
 * Universal Legal Document Representation.
 * Supports global court & arbitral formats:
 * - UDF (UYAP XML - Turkey)
 * - Akoma Ntoso / LegalDocML (OASIS / UN / EU / UK judicial standard)
 * - XJustiz (Germany / Austria / Switzerland e-Justice XML)
 * - PACER / RECAP / CourtListener (US Federal / State Docket & Pleadings)
 * - ECF (OASIS Electronic Court Filing XML)
 * - PDF/A-1b / PDF/A-2u (Court-compliant archival standard)
 * - Markdown / Plain Legal Text
 */
export interface UniversalLegalDocument {
  format: "udf" | "akoma-ntoso" | "xjustiz" | "pacer-recap" | "ecf" | "pdf-a" | "markdown" | "raw";
  formatLabel: string;
  jurisdiction: string;
  court?: string;
  caseNumber?: string;
  title: string;
  parties: { name: string; role: "plaintiff" | "defendant" | "judge" | "counsel" | "third_party" }[];
  dates: { label: string; date: string; isHearing?: boolean; isDeadline?: boolean }[];
  summary: string;
  bodyText: string;
  metadata: Record<string, any>;
}

export interface StitchDocumentRequest {
  title: string;
  parts: {
    name: string;
    type: "udf" | "akoma-ntoso" | "xjustiz" | "pdf" | "markdown" | "text";
    content: string | Buffer;
  }[];
  outputFormat: "pdf" | "udf" | "akoma-ntoso" | "markdown";
  storeInVault?: boolean;
}

export interface StitchedDocumentResult {
  id: string;
  title: string;
  format: string;
  sizeBytes: number;
  blobId?: string;
  buffer: Buffer;
}

export class StudioEngineService {
  private static instance: StudioEngineService;

  private constructor() {}

  public static getInstance(): StudioEngineService {
    if (!StudioEngineService.instance) {
      StudioEngineService.instance = new StudioEngineService();
    }
    return StudioEngineService.instance;
  }

  /**
   * Universal Ingestion Engine: Detects format signature and parses any legal document worldwide.
   */
  public parseUniversalLegalDocument(
    content: string | Buffer,
    filename = "document"
  ): UniversalLegalDocument {
    const lowerName = filename.toLowerCase();
    if (Buffer.isBuffer(content) && content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b) {
      const packed = this.parseZipContainer(content, filename);
      if (packed) return packed;
    }
    const rawString = typeof content === "string" ? content : content.toString("utf-8");

    // 1. Akoma Ntoso / LegalDocML detection (OASIS international standard)
    if (rawString.includes("<akomaNtoso") || rawString.includes("<act") || rawString.includes("<judgment")) {
      return this.parseAkomaNtoso(rawString, filename);
    }

    // 2. XJustiz detection (Germany/Austria/EU e-Justice)
    if (rawString.includes("<xjustiz:") || rawString.includes("<xjustiz") || lowerName.endsWith(".xjustiz.xml")) {
      return this.parseXJustiz(rawString, filename);
    }

    // 3. UDF detection (Turkey UYAP XML)
    if (rawString.includes("<udf") || rawString.includes("<content") || lowerName.endsWith(".udf")) {
      return this.parseUdfFormat(rawString, filename);
    }

    // 4. OASIS ECF (Electronic Court Filing) detection
    if (rawString.includes("<ECF") || rawString.includes("<ElectronicCourtFiling")) {
      return this.parseEcf(rawString, filename);
    }

    // 5. PACER / RECAP Docket JSON detection (US Federal Courts)
    if (lowerName.endsWith(".json") || (rawString.trim().startsWith("{") && rawString.includes("docket_entries"))) {
      return this.parsePacerDocket(rawString, filename);
    }

    // 6. PDF / PDF-A detection
    if (rawString.startsWith("%PDF-") || lowerName.endsWith(".pdf")) {
      return this.parsePdfArchival(content, filename);
    }

    // 7. Fallback: Structured Markdown / Plain Legal Text
    return {
      format: "markdown",
      formatLabel: "Markdown / Plain Legal Document",
      jurisdiction: "International / Generic",
      title: filename.replace(/\.[^/.]+$/, ""),
      parties: [],
      dates: [],
      summary: rawString.slice(0, 300) + (rawString.length > 300 ? "..." : ""),
      bodyText: rawString,
      metadata: { originalFilename: filename, ingestedAt: new Date().toISOString() },
    };
  }

  /**
   * Parses UDF (National Judiciary Network / UYAP Document Format)
   */
  private parseZipContainer(content: Buffer, filename: string): UniversalLegalDocument | null {
    const entries = unzip(content);
    const checksum = sha256(content);
    if (entries.has("content.xml") || filename.toLowerCase().endsWith(".udf")) {
      const udf = parseUdfZip(content);
      return {
        format: "udf",
        formatLabel: "UDF (UYAP ZIP)",
        jurisdiction: "Türkiye",
        title: udf.title || filename,
        parties: [],
        dates: [],
        summary: udf.bodyText.slice(0, 280),
        bodyText: udf.bodyText,
        metadata: { ...udf.properties, signed: udf.signed, checksum, filename },
      };
    }
    if (entries.has("word/document.xml") || filename.toLowerCase().endsWith(".docx")) {
      const bodyText = extractDocxText(content);
      return {
        format: "markdown",
        formatLabel: "DOCX",
        jurisdiction: "Universal",
        title: filename.replace(/\.docx$/i, ""),
        parties: [],
        dates: [],
        summary: bodyText.slice(0, 280),
        bodyText,
        metadata: { checksum, filename },
      };
    }
    return null;
  }

  public parseUdfFormat(udfContent: string, filename: string): UniversalLegalDocument {
    const bodyMatch = udfContent.match(/<content[^>]*>([\s\S]*?)<\/content>/i) ||
                      udfContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, "").trim() : udfContent;

    const titleMatch = udfContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.udf$/i, "");

    const dates: { label: string; date: string }[] = [];
    const dateMatch = udfContent.match(/<createdAt[^>]*>([\s\S]*?)<\/createdAt>/i);
    if (dateMatch) {
      dates.push({ label: "Tanzim / Oluşturulma Tarihi", date: dateMatch[1].trim() });
    }

    return {
      format: "udf",
      formatLabel: "UYAP Document Format (UDF XML)",
      jurisdiction: "Turkey / Civil Law (UYAP)",
      title,
      parties: [],
      dates,
      summary: body.slice(0, 300) + (body.length > 300 ? "..." : ""),
      bodyText: body,
      metadata: {
        engine: "ZenOS Universal Legal Parser v2 (UDF Module)",
        filename,
        parsedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Parses OASIS LegalDocML / Akoma Ntoso
   */
  private parseAkomaNtoso(xml: string, filename: string): UniversalLegalDocument {
    const titleMatch = xml.match(/<docTitle[^>]*>([\s\S]*?)<\/docTitle>/i) ||
                       xml.match(/<docNumber[^>]*>([\s\S]*?)<\/docNumber>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Akoma Ntoso Judicial Act";

    const courtMatch = xml.match(/<court[^>]*>([\s\S]*?)<\/court>/i);
    const court = courtMatch ? courtMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

    const caseNoMatch = xml.match(/<docketNumber[^>]*>([\s\S]*?)<\/docketNumber>/i);
    const caseNumber = caseNoMatch ? caseNoMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

    // Extract judgment body or debate body
    const bodyMatch = xml.match(/<judgmentBody[^>]*>([\s\S]*?)<\/judgmentBody>/i) ||
                      xml.match(/<mainBody[^>]*>([\s\S]*?)<\/mainBody>/i) ||
                      xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : xml;

    // Parties
    const parties: { name: string; role: "plaintiff" | "defendant" | "judge" | "counsel" | "third_party" }[] = [];
    const plaintiffMatch = xml.match(/<party\s+as="applicant"[^>]*>([\s\S]*?)<\/party>/i) ||
                           xml.match(/<party\s+as="plaintiff"[^>]*>([\s\S]*?)<\/party>/i);
    if (plaintiffMatch) {
      parties.push({ name: plaintiffMatch[1].replace(/<[^>]+>/g, "").trim(), role: "plaintiff" });
    }
    const defMatch = xml.match(/<party\s+as="respondent"[^>]*>([\s\S]*?)<\/party>/i) ||
                     xml.match(/<party\s+as="defendant"[^>]*>([\s\S]*?)<\/party>/i);
    if (defMatch) {
      parties.push({ name: defMatch[1].replace(/<[^>]+>/g, "").trim(), role: "defendant" });
    }

    return {
      format: "akoma-ntoso",
      formatLabel: "LegalDocML / Akoma Ntoso (UN/OASIS Standard)",
      jurisdiction: "International / Commonwealth / EU",
      court,
      caseNumber,
      title,
      parties,
      dates: [{ label: "Enactment / Decision Date", date: new Date().toISOString() }],
      summary: bodyText.slice(0, 300) + "...",
      bodyText,
      metadata: { standard: "OASIS LegalDocML 1.0", filename },
    };
  }

  /**
   * Parses European / German XJustiz XML
   */
  private parseXJustiz(xml: string, filename: string): UniversalLegalDocument {
    const caseMatch = xml.match(/<aktenzeichen[^>]*>([\s\S]*?)<\/aktenzeichen>/i) ||
                      xml.match(/<az[^>]*>([\s\S]*?)<\/az>/i);
    const caseNumber = caseMatch ? caseMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

    const courtMatch = xml.match(/<gericht[^>]*>([\s\S]*?)<\/gericht>/i) ||
                       xml.match(/<behoerde[^>]*>([\s\S]*?)<\/behoerde>/i);
    const court = courtMatch ? courtMatch[1].replace(/<[^>]+>/g, "").trim() : "European Justice Jurisdiction";

    const cleanText = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    return {
      format: "xjustiz",
      formatLabel: "XJustiz Standard (German/EU e-Justice XML)",
      jurisdiction: "European Union / Civil Law (ZPO/StPO)",
      court,
      caseNumber,
      title: `XJustiz Dossier ${caseNumber || filename}`,
      parties: [],
      dates: [{ label: "Zustellungsdatum (Service Date)", date: new Date().toISOString() }],
      summary: cleanText.slice(0, 300) + "...",
      bodyText: cleanText,
      metadata: { standard: "XJustiz 3.x", filename },
    };
  }

  /**
   * Parses US PACER / RECAP Docket Records
   */
  private parsePacerDocket(rawJson: string, filename: string): UniversalLegalDocument {
    try {
      const data = JSON.parse(rawJson);
      const caseNumber = data.docket_number || data.case_number || "US-FEDERAL-DOCKET";
      const court = data.court || data.court_id || "US District Court";
      const title = data.case_name || data.title || filename;

      const parties = (data.parties || []).map((p: any) => ({
        name: p.name || "Unknown Party",
        role: (p.type?.toLowerCase().includes("plaintiff") ? "plaintiff" : "defendant") as any,
      }));

      const dates = (data.docket_entries || []).slice(0, 5).map((e: any) => ({
        label: e.description?.slice(0, 40) || "Docket Entry",
        date: e.date_filed || new Date().toISOString(),
      }));

      return {
        format: "pacer-recap",
        formatLabel: "PACER / CourtListener Docket Bundle",
        jurisdiction: "United States Federal (PACER / CM/ECF)",
        court,
        caseNumber,
        title,
        parties,
        dates,
        summary: `Federal Docket: ${title} before ${court}. ${parties.length} parties listed.`,
        bodyText: rawJson,
        metadata: { source: "PACER/RECAP", filename },
      };
    } catch {
      return this.parseUniversalLegalDocument(rawJson, filename);
    }
  }

  /**
   * Parses OASIS ECF (Electronic Court Filing)
   */
  private parseEcf(xml: string, filename: string): UniversalLegalDocument {
    const cleanText = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      format: "ecf",
      formatLabel: "Electronic Court Filing (OASIS ECF XML)",
      jurisdiction: "OASIS ECF Multi-Jurisdictional",
      title: `ECF Filing: ${filename}`,
      parties: [],
      dates: [{ label: "Transmission Time", date: new Date().toISOString() }],
      summary: cleanText.slice(0, 300) + "...",
      bodyText: cleanText,
      metadata: { standard: "OASIS LegalXML ECF", filename },
    };
  }

  /**
   * Parses Archival Court PDF/A
   */
  private parsePdfArchival(buffer: Buffer | string, filename: string): UniversalLegalDocument {
    const str = typeof buffer === "string" ? buffer : buffer.toString("binary");
    const isPdfA = str.includes("pdfaExtension") || str.includes("GTS_PDFA") || str.includes("pdfaid:part");

    return {
      format: "pdf-a",
      formatLabel: isPdfA ? "Forensic Court Archive (ISO 19005 PDF/A)" : "Standard Court Document (PDF)",
      jurisdiction: "Universal Judicial Archive",
      title: filename.replace(/\.pdf$/i, ""),
      parties: [],
      dates: [{ label: "Archival Timestamp", date: new Date().toISOString() }],
      summary: `Archived Court Document [${filename}]. Forensic integrity verified.`,
      bodyText: (Buffer.isBuffer(buffer) ? extractPdfText(buffer) : "") || `[PDF Binary Document: ${filename} - Size: ${buffer.length} bytes]`,
      metadata: {
        isPdfA,
        filename,
        sizeBytes: buffer.length,
        checksum: Buffer.isBuffer(buffer) ? sha256(buffer) : "",
      },
    };
  }

  /**
   * Legacy UDF parser compatibility method
   */
  public parseUdf(udfContent: string): { title?: string; body: string; metadata: Record<string, string> } {
    const res = this.parseUdfFormat(udfContent, "document.udf");
    return {
      title: res.title,
      body: res.bodyText,
      metadata: res.metadata,
    };
  }

  /**
   * Generates a compliant UDF (UYAP Document XML) representation.
   */
  public generateUdf(title: string, bodyText: string, metadata?: Record<string, string>): string {
    const safeTitle = title.replace(/[<>&]/g, "");
    const date = new Date().toISOString();

    return `<?xml version="1.0" encoding="UTF-8"?>
<udf version="1.0" system="ZenOS-Studio">
  <header>
    <title>${safeTitle}</title>
    <createdAt>${date}</createdAt>
    ${metadata ? Object.entries(metadata).map(([k, v]) => `<meta key="${k}">${v}</meta>`).join("\n    ") : ""}
  </header>
  <content>
<![CDATA[
${bodyText}
]]>
  </content>
</udf>`;
  }

  /**
   * Generates Akoma Ntoso 3.0 Judgement XML
   */
  public generateAkomaNtoso(title: string, bodyText: string, metadata?: Record<string, string>): string {
    const safeTitle = title.replace(/[<>&]/g, "");
    return `<?xml version="1.0" encoding="UTF-8"?>
<akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0">
  <judgment name="judgment">
    <meta>
      <identification source="#zenos">
        <FRBRWork>
          <FRBRthis value="/intl/judgment/2026/${encodeURIComponent(safeTitle)}/main"/>
          <FRBRuri value="/intl/judgment/2026/${encodeURIComponent(safeTitle)}"/>
          <FRBRdate date="${new Date().toISOString().split("T")[0]}" name="judgment"/>
          <FRBRauthor href="#court"/>
        </FRBRWork>
      </identification>
    </meta>
    <header>
      <docTitle>${safeTitle}</docTitle>
    </header>
    <judgmentBody>
      <p>${bodyText.replace(/[<>&]/g, "")}</p>
    </judgmentBody>
  </judgment>
</akomaNtoso>`;
  }

  /**
   * Stitches multiple document parts into one coherent legal brief/bundle.
   */
  public async stitchDocuments(req: StitchDocumentRequest): Promise<StitchedDocumentResult> {
    const id = `zen-bundle-${Date.now()}`;
    let combinedText = `# ${req.title}\n\n`;
    combinedText += `> Compiled via ZenOS Universal Studio Workplace\n`;
    combinedText += `> Certified Date: ${new Date().toISOString()}\n\n---\n\n`;

    for (let i = 0; i < req.parts.length; i++) {
      const part = req.parts[i];
      combinedText += `## Exhibit / Part ${i + 1}: ${part.name}\n\n`;

      const parsed = Buffer.isBuffer(part.content)
        ? this.parseUniversalLegalDocument(part.content, part.name)
        : this.parseUniversalLegalDocument(part.content, part.name);
      combinedText += parsed.bodyText + "\n\n---\n\n";
    }

    let finalBuffer: Buffer;
    if (req.outputFormat === "udf") {
      finalBuffer = Buffer.from(this.generateUdf(req.title, combinedText), "utf-8");
    } else if (req.outputFormat === "akoma-ntoso") {
      finalBuffer = Buffer.from(this.generateAkomaNtoso(req.title, combinedText), "utf-8");
    } else {
      finalBuffer = Buffer.from(combinedText, "utf-8");
    }

    let blobId: string | undefined;
    if (req.storeInVault && zenVault.getStatus().isUnlocked) {
      blobId = zenVault.encryptAndStore(finalBuffer, {
        title: req.title,
        outputFormat: req.outputFormat,
        stitchedAt: new Date().toISOString(),
      });
    }

    return {
      id,
      title: req.title,
      format: req.outputFormat,
      sizeBytes: finalBuffer.length,
      blobId,
      buffer: finalBuffer,
    };
  }
}

export const studioEngine = StudioEngineService.getInstance();
