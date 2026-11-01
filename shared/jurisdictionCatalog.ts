import raw from "./jurisdiction-catalog.json";

export type JurisdictionCode =
  | "TR" | "UK-EWH" | "UK-SCT" | "UK-NIR"
  | "DE" | "FR" | "NL" | "IT" | "ES" | "CH" | "AT" | "BE"
  | "EU-CJEU" | "ECHR" | "ICC-ARB" | "UNCITRAL-ARB";

export interface CourtDef {
  id: string;
  labelTr: string;
  labelLocal: string;
  kind: string;
}

export interface StatuteDef {
  code: string;
  number?: string;
  titleTr: string;
  family: string;
}

export interface JurisdictionDef {
  code: JurisdictionCode;
  labelTr: string;
  courts: CourtDef[];
  statutes: StatuteDef[];
  procedureFamilies: string[];
  caseLawConnectors: string[];
}

const extras: JurisdictionDef[] = [
  {
    code: "UK-SCT",
    labelTr: "İskoçya",
    procedureFamilies: ["CrimPR"],
    caseLawConnectors: ["bailii"],
    courts: [
      { id: "uk-sct-sheriff", labelTr: "Sheriff Court", labelLocal: "Sheriff Court", kind: "civil-first" },
      { id: "uk-sct-session", labelTr: "Court of Session", labelLocal: "Court of Session", kind: "supreme-ordinary" },
    ],
    statutes: [{ code: "CrimPR", titleTr: "Criminal Procedure Rules", family: "criminal-procedure" }],
  },
  {
    code: "UK-NIR",
    labelTr: "Kuzey İrlanda",
    procedureFamilies: ["CrimPR"],
    caseLawConnectors: ["bailii"],
    courts: [
      { id: "uk-nir-crown", labelTr: "Crown Court", labelLocal: "Crown Court", kind: "criminal-first" },
      { id: "uk-nir-coa", labelTr: "Court of Appeal NI", labelLocal: "Court of Appeal in Northern Ireland", kind: "appeal" },
    ],
    statutes: [{ code: "CrimPR", titleTr: "Criminal Procedure Rules", family: "criminal-procedure" }],
  },
  {
    code: "UNCITRAL-ARB",
    labelTr: "UNCITRAL tahkim",
    procedureFamilies: ["UNCITRAL_RULES"],
    caseLawConnectors: [],
    courts: [
      { id: "uncitral-arb", labelTr: "UNCITRAL", labelLocal: "UNCITRAL Arbitration", kind: "intl-arb" },
    ],
    statutes: [{ code: "UNCITRAL Rules", titleTr: "UNCITRAL Tahkim Kuralları", family: "other" }],
  },
];

const loaded = (raw as { jurisdictions: JurisdictionDef[] }).jurisdictions;
const present = new Set(loaded.map((item) => item.code));

export const JURISDICTIONS: JurisdictionDef[] = [
  ...loaded,
  ...extras.filter((item) => !present.has(item.code)),
];

export function jurisdictionByCode(code: string): JurisdictionDef | undefined {
  return JURISDICTIONS.find((item) => item.code === code);
}

export function courtsFor(code: string): CourtDef[] {
  return jurisdictionByCode(code)?.courts || [];
}

export function familiesFor(code: string): string[] {
  return jurisdictionByCode(code)?.procedureFamilies || [];
}

export function courtById(id: string): CourtDef | undefined {
  return JURISDICTIONS.flatMap((item) => item.courts).find((court) => court.id === id);
}
