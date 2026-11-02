/** Konuşma metnini cümlelere böler ve seslendirmeye uygun hale getirir. */

const ABBREVIATION = /(?:^|[\s(])(?:Dr|Prof|Av|vb|vs|No|Md|Sn|bkz|örn|yy|Hz)\.$/i;

export function toSpokenText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/[*_~>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tamamlanan cümleleri ayırır. Nokta, soru ve ünlemden sonra boşluk bekler.
 * `flush` akış bittiğinde kuyrukta kalan parçayı da cümle sayar.
 */
export function takeCompleteSentences(buffer: string, flush: boolean): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let start = 0;

  const push = (raw: string) => {
    const sentence = toSpokenText(raw);
    if (sentence) ready.push(sentence);
  };

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "\n") continue;
    if (ch === "." && ABBREVIATION.test(buffer.slice(Math.max(0, i - 12), i + 1))) continue;
    const next = buffer[i + 1];
    if (ch !== "\n" && next && !/\s/.test(next)) continue;
    push(buffer.slice(start, ch === "\n" ? i : i + 1));
    start = i + 1;
  }

  let rest = buffer.slice(start);
  if (!flush && rest.length > 500) {
    const splitAt = rest.lastIndexOf(" ", 500);
    const cut = splitAt > 40 ? splitAt : 500;
    push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (flush) {
    push(rest);
    rest = "";
  }
  return { ready, rest };
}
