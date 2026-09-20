/**
 * PDF text + structure extraction, server-side only.
 *
 * pdfjs-dist's *legacy* build is the one that runs under Node without a DOM.
 * It is listed in `serverExternalPackages` so Next leaves it alone at build time.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  // pdfjs reads this in Node to run the worker on the main thread (no Worker threads).
  // eslint-disable-next-line no-var
  var pdfjsWorker: { WorkerMessageHandler: unknown } | undefined;
}

let pdfjsPromise: Promise<any> | null = null;

async function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      if (!globalThis.pdfjsWorker) {
        globalThis.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      }
      return import("pdfjs-dist/legacy/build/pdf.mjs");
    })();
  }
  return pdfjsPromise;
}

export interface PdfDocument {
  numPages: number;
  getPageText(pageNumber: number): Promise<string>;
  getOutlineChapters(): Promise<RawChapter[]>;
  destroy(): Promise<void>;
}

export interface RawChapter {
  title: string;
  startPage: number;
}

export async function loadPdf(data: Buffer): Promise<PdfDocument> {
  const pdfjs = await getPdfjs();

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  return {
    numPages: doc.numPages,

    async getPageText(pageNumber: number) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let out = "";
      for (const item of content.items as any[]) {
        if (typeof item.str !== "string") continue;
        out += item.str;
        if (item.hasEOL) out += "\n";
        else if (!item.str.endsWith(" ")) out += " ";
      }
      page.cleanup();
      return normalisePageText(out);
    },

    async getOutlineChapters() {
      const outline = await doc.getOutline().catch(() => null);
      if (!outline || outline.length === 0) return [];

      const chapters: RawChapter[] = [];
      for (const item of outline) {
        const page = await destToPageNumber(doc, item.dest).catch(() => null);
        const title = stripNullBytes(String(item.title ?? "").trim());
        if (page && title) chapters.push({ title, startPage: page });
      }
      return dedupeChapters(chapters);
    },

    async destroy() {
      await doc.destroy().catch(() => undefined);
    },
  };
}

async function destToPageNumber(doc: any, dest: any): Promise<number | null> {
  let resolved = dest;
  if (typeof resolved === "string") resolved = await doc.getDestination(resolved);
  if (!Array.isArray(resolved) || resolved.length === 0) return null;

  const ref = resolved[0];
  if (ref && typeof ref === "object") {
    const index = await doc.getPageIndex(ref);
    return index + 1;
  }
  if (typeof ref === "number") return ref + 1;
  return null;
}

function dedupeChapters(chapters: RawChapter[]): RawChapter[] {
  const sorted = [...chapters].sort((a, b) => a.startPage - b.startPage);
  const out: RawChapter[] = [];
  for (const ch of sorted) {
    if (out.length && out[out.length - 1].startPage === ch.startPage) continue;
    out.push(ch);
  }
  return out;
}

/** Postgres `text` columns reject the null byte (0x00); PDF text extraction often includes it. */
export function stripNullBytes(text: string): string {
  return text.includes("\0") ? text.replaceAll("\0", "") : text;
}

/**
 * Tidy raw extracted text:
 *  - join words broken across a line by a hyphen
 *  - drop lines that are just a page number or a repeated running header
 *  - collapse runaway whitespace
 */
export function normalisePageText(raw: string): string {
  const lines = stripNullBytes(raw)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());

  // Blank lines are kept — they are the paragraph breaks the segmenter splits on.
  const kept = lines.map((line, i) => (isRunningHeader(line, i, lines.length) ? "" : line));

  return (
    kept
      .join("\n")
      // Word broken across a line break: "com-\npound" -> "compound",
      // but leave real compounds like "self-\nimprovement" hyphenated.
      .replace(/([a-zA-Z]{2,})-\n([a-z])/g, (match, head: string, next: string) =>
        KEEP_HYPHEN_PREFIXES.has(head.toLowerCase()) ? `${head}-${next}` : `${head}${next}`,
      )
      // A single line break mid-sentence is just PDF line wrapping.
      .replace(/([^\n])\n(?=[a-z,;)])/g, "$1 ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

/**
 * Prefixes that are almost always followed by a real hyphen in English, so a
 * line break after them should not be silently closed up. Everything else is
 * assumed to be PDF line-wrap hyphenation ("com-\npound" -> "compound").
 */
const KEEP_HYPHEN_PREFIXES = new Set([
  "self",
  "non",
  "well",
  "semi",
  "anti",
  "quasi",
  "pseudo",
  "ultra",
]);

function isRunningHeader(line: string, index: number, total: number): boolean {
  if (!line) return true;
  // Bare page numbers, roman or arabic.
  if (/^[ivxlcdm]{1,7}$/i.test(line)) return true;
  if (/^\d{1,4}$/.test(line)) return true;
  // "12 | Atomic Habits" style running heads, only at the very top or bottom.
  const atEdge = index <= 1 || index >= total - 2;
  if (atEdge && /^(page\s+)?\d{1,4}\s*[|·—–-]\s*.{0,60}$/i.test(line)) return true;
  if (atEdge && /^.{0,60}\s*[|·—–-]\s*(page\s+)?\d{1,4}$/i.test(line)) return true;
  return false;
}

/** Rough word count, good enough for a reading-time estimate. */
export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}
