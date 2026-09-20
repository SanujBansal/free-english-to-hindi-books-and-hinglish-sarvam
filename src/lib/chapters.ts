import type { RawChapter } from "./pdf";

const HEADING_PATTERNS: RegExp[] = [
  /^\s*chapter\s+(\d{1,3}|[ivxlcdm]{1,7})\b[.:\s-]*(.{0,80})$/i,
  /^\s*(?:part|book|section)\s+(\d{1,3}|[ivxlcdm]{1,7})\b[.:\s-]*(.{0,80})$/i,
  /^\s*(?:adhyay|अध्याय)\s*(\d{1,3})\b[.:\s-]*(.{0,80})$/i,
  /^\s*(\d{1,2})\s*[.)]\s+([A-Z][^.!?]{3,70})$/,
];

/**
 * Detect chapter starts from the first few lines of each page, used when the
 * PDF has no usable outline. Deliberately conservative — a false chapter is
 * more annoying to a reader than a missing one.
 */
export function detectChaptersFromPages(pages: { number: number; text: string }[]): RawChapter[] {
  const found: RawChapter[] = [];

  for (const page of pages) {
    const head = page.text.split("\n").slice(0, 4);

    for (const line of head) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 90) continue;

      for (const pattern of HEADING_PATTERNS) {
        if (!pattern.test(trimmed)) continue;
        found.push({ title: tidyTitle(trimmed), startPage: page.number });
        break;
      }

      if (found.length && found[found.length - 1].startPage === page.number) break;
    }
  }

  return found;
}

/** Collapse whitespace, soften ALL-CAPS headings, cap the length. */
export function tidyTitle(raw: string): string {
  let title = raw.replace(/\s+/g, " ").replace(/\s*[.:—–-]\s*$/, "").trim();

  const letters = title.replace(/[^A-Za-z]/g, "");
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    title = title
      .toLowerCase()
      .replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase())
      // Roman numerals read badly title-cased.
      .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii|Xiii|Xiv|Xv)\b/g, (m) => m.toUpperCase());
  }

  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title.slice(0, 120);
}

export interface BuiltChapter {
  index: number;
  title: string;
  startPage: number;
  endPage: number;
}

/**
 * Turn chapter starts into closed page ranges covering the whole book.
 * Anything before the first detected chapter becomes "Front matter".
 */
export function buildChapterRanges(starts: RawChapter[], pageCount: number): BuiltChapter[] {
  if (pageCount <= 0) return [];

  const sorted = [...starts]
    .filter((c) => c.startPage >= 1 && c.startPage <= pageCount)
    .sort((a, b) => a.startPage - b.startPage);

  if (sorted.length === 0) {
    return [{ index: 1, title: "Full book", startPage: 1, endPage: pageCount }];
  }

  const chapters: BuiltChapter[] = [];
  if (sorted[0].startPage > 1) {
    chapters.push({ index: 1, title: "Front matter", startPage: 1, endPage: sorted[0].startPage - 1 });
  }

  sorted.forEach((chapter, i) => {
    const next = sorted[i + 1];
    chapters.push({
      index: chapters.length + 1,
      title: chapter.title,
      startPage: chapter.startPage,
      endPage: next ? Math.max(chapter.startPage, next.startPage - 1) : pageCount,
    });
  });

  return chapters;
}
