export interface StatutoryDeadline {
  title: string;
  ruleCitation: string;
  statute: string;
  triggerEvent: string;
  dueDate: string;
  daysCount: number;
  urgency: "critical" | "warning" | "normal";
  description: string;
  notice?: string;
}

const TR_HOLIDAYS = [
  "01-01",
  "04-23",
  "05-01",
  "05-19",
  "07-15",
  "08-30",
  "10-29",
];

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isPublicHoliday(date: Date): boolean {
  const key = iso(date).slice(5);
  return TR_HOLIDAYS.includes(key);
}

function inRecess(date: Date): boolean {
  const month = date.getMonth();
  const day = date.getDate();
  return (month === 6 && day >= 20) || month === 7;
}

export function rollForward(start: Date, days: number, applyTurkishCalendar: boolean): { date: Date; notice?: string } {
  const target = new Date(start);
  target.setDate(target.getDate() + days);
  const notes: string[] = [];
  if (applyTurkishCalendar && inRecess(target)) {
    target.setMonth(8, 7);
    notes.push("HMK m. 104 adli tatil uzatması (7 Eylül).");
  }
  if (applyTurkishCalendar) {
    let guard = 0;
    while (guard < 14 && (target.getDay() === 0 || target.getDay() === 6 || isPublicHoliday(target))) {
      target.setDate(target.getDate() + 1);
      guard += 1;
    }
    if (guard) notes.push("Hafta sonu veya resmi tatil nedeniyle ilk iş gününe alındı.");
  } else {
    if (target.getDay() === 6) target.setDate(target.getDate() + 2);
    if (target.getDay() === 0) target.setDate(target.getDate() + 1);
  }
  return { date: target, notice: notes.join(" ") || undefined };
}

interface Statute {
  title: string;
  statute: string;
  days: number;
  triggerEvent: string;
  urgency: StatutoryDeadline["urgency"];
  description: string;
}

const TURKISH: Statute[] = [
  { title: "Cevap dilekçesi", statute: "HMK m. 127", days: 14, triggerEvent: "Dava dilekçesinin tebliği", urgency: "critical", description: "Tebliğden itibaren iki hafta." },
  { title: "Cevaba cevap", statute: "HMK m. 136", days: 14, triggerEvent: "Cevap dilekçesinin tebliği", urgency: "warning", description: "Cevabın tebliğinden itibaren iki hafta." },
  { title: "İstinaf", statute: "HMK m. 345", days: 14, triggerEvent: "Gerekçeli kararın tebliği", urgency: "critical", description: "Tebliğden itibaren iki haftalık kesin süre." },
  { title: "Temyiz", statute: "HMK m. 361", days: 14, triggerEvent: "Bölge adliye mahkemesi kararının tebliği", urgency: "critical", description: "Tebliğden itibaren iki hafta." },
  { title: "İptal davası", statute: "İYUK m. 7", days: 60, triggerEvent: "İşlemin tebliği veya öğrenme", urgency: "critical", description: "İdari işlemin tebliğinden itibaren altmış gün." },
  { title: "İdari yargı temyizi", statute: "İYUK m. 46", days: 30, triggerEvent: "Kararın tebliği", urgency: "critical", description: "Tebliğden itibaren otuz gün." },
  { title: "Ceza itirazı", statute: "CMK m. 268", days: 7, triggerEvent: "Kararın öğrenilmesi", urgency: "critical", description: "Öğrenmeden itibaren yedi gün." },
  { title: "İcra şikayeti", statute: "İİK m. 16", days: 7, triggerEvent: "İşlemin öğrenilmesi", urgency: "warning", description: "Öğrenmeden itibaren yedi gün." },
  { title: "Tahkim iptali", statute: "HMK m. 439", days: 30, triggerEvent: "Hakem kararının tebliği", urgency: "critical", description: "Tebliğden itibaren bir ay." },
];

function foreign(jurisdiction: string): Statute[] {
  const jur = jurisdiction.toLowerCase();
  if (jur.includes("us") || jur.includes("frcp")) {
    return [
      { title: "Cevap dilekçesi", statute: "FRCP 12(a)", days: 21, triggerEvent: "Tebligat", urgency: "critical", description: "Tebligattan itibaren 21 gün." },
      { title: "Keşif konferansı", statute: "FRCP 26(f)", days: 30, triggerEvent: "Tebligat", urgency: "warning", description: "İlk açıklamalar için konferans." },
    ];
  }
  if (jur.includes("uk") || jur.includes("cpr")) {
    return [
      { title: "Tebligat kabulü", statute: "CPR 10.3", days: 14, triggerEvent: "Tebligat", urgency: "critical", description: "14 gün içinde kabul." },
      { title: "Savunma", statute: "CPR 15.4", days: 28, triggerEvent: "Tebligat", urgency: "warning", description: "28 gün içinde savunma." },
    ];
  }
  if (jur.includes("de") || jur.includes("zpo") || jur.includes("alman")) {
    return [
      { title: "Cevap", statute: "ZPO § 277", days: 14, triggerEvent: "Tebligat", urgency: "critical", description: "İki haftalık cevap süresi. Madde numarasını resmi metinden doğrulayın." },
      { title: "İstinaf", statute: "ZPO § 517", days: 30, triggerEvent: "Kararın tebliği", urgency: "warning", description: "Bir aylık istinaf. Madde numarasını resmi metinden doğrulayın." },
    ];
  }
  if (jur.includes("fr") || jur.includes("cpc")) {
    return [
      { title: "Temyiz", statute: "CPC art. 538", days: 30, triggerEvent: "Kararın tebliği", urgency: "critical", description: "Bir aylık temyiz. Madde numarasını resmi metinden doğrulayın." },
    ];
  }
  if (jur.includes("icc") || jur.includes("uncitral") || jur.includes("arbitration") || jur.includes("tahkim")) {
    return [
      { title: "Tahkim cevabı", statute: "ICC m. 5", days: 30, triggerEvent: "Talebin tebliği", urgency: "critical", description: "Otuz gün içinde cevap." },
      { title: "Tahkim iptali", statute: "HMK m. 439", days: 30, triggerEvent: "Hakem kararının tebliği", urgency: "warning", description: "Hakem kararının tebliğinden itibaren bir ay." },
    ];
  }
  return [];
}

export function computeStatutoryDeadlines(input: {
  jurisdiction?: string;
  procedureFamily?: string;
  serviceDate?: string;
  triggerEvent?: string;
}): { jurisdiction: string; serviceDate: string; triggerEvent: string; deadlines: StatutoryDeadline[] } {
  const jurisdiction = input.jurisdiction || "Türkiye";
  const start = input.serviceDate ? new Date(input.serviceDate) : new Date();
  const family = (input.procedureFamily || "").toUpperCase();
  const jur = `${jurisdiction} ${family}`.toLowerCase();
  const turkish = jur.includes("turkey") || jur.includes("türk") || family === "TR" || jurisdiction === "TR" || jurisdiction === "Türkiye" || ["HMK", "IYUK", "CMK", "IIK"].includes(family);
  let catalog = turkish ? TURKISH : foreign(jur);
  if (family === "HMK") catalog = TURKISH.filter((item) => item.statute.startsWith("HMK"));
  else if (family === "IYUK") catalog = TURKISH.filter((item) => item.statute.startsWith("İYUK"));
  else if (family === "CMK") catalog = TURKISH.filter((item) => item.statute.startsWith("CMK"));
  else if (family === "IIK") catalog = TURKISH.filter((item) => item.statute.startsWith("İİK"));
  else if (family === "CPR") catalog = foreign("uk cpr");
  else if (family === "ZPO") catalog = foreign("de zpo");
  else if (family === "CPC_FR" || family === "CPC") catalog = foreign("fr cpc");
  const chosen = catalog.length ? catalog : turkish ? TURKISH : foreign(jur);
  const deadlines = chosen.map((item) => {
    const rolled = rollForward(start, item.days, turkish || item.statute.startsWith("HMK") || item.statute.startsWith("İYUK"));
    return {
      title: item.title,
      ruleCitation: item.statute,
      statute: item.statute,
      triggerEvent: input.triggerEvent || item.triggerEvent,
      dueDate: iso(rolled.date),
      daysCount: item.days,
      urgency: item.urgency,
      description: item.description,
      notice: rolled.notice,
    };
  });
  return {
    jurisdiction,
    serviceDate: iso(start),
    triggerEvent: input.triggerEvent || chosen[0]?.triggerEvent || "Tetik",
    deadlines,
  };
}
