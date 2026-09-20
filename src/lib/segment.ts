/**
 * A "segment" is the unit the reader plays: roughly a paragraph's worth of
 * English text. It has to stay small for three reasons:
 *   1. the LLM rewrite is more faithful on short passages,
 *   2. bulbul:v3 takes at most 2500 chars per request,
 *   3. the listener can scrub and re-hear a short piece.
 */
export const SEGMENT_TARGET_CHARS = 700;
export const SEGMENT_MAX_CHARS = 1100;
export const SEGMENT_MIN_CHARS = 120;

export function segmentPageText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const source = paragraphs.length ? paragraphs : [text.replace(/\s+/g, " ").trim()];
  const pieces: string[] = [];

  for (const paragraph of source) {
    if (paragraph.length <= SEGMENT_MAX_CHARS) {
      pieces.push(paragraph);
      continue;
    }
    pieces.push(...splitOnSentences(paragraph, SEGMENT_TARGET_CHARS, SEGMENT_MAX_CHARS));
  }

  return mergeTinyPieces(pieces);
}

function splitOnSentences(text: string, target: number, max: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let buf = "";

  for (const sentence of sentences) {
    const candidate = (buf + sentence).trim();

    if (candidate.length > max && buf) {
      out.push(buf.trim());
      buf = sentence;
      continue;
    }

    buf = candidate;
    if (buf.length >= target) {
      out.push(buf.trim());
      buf = "";
    }
  }

  if (buf.trim()) out.push(buf.trim());
  return out.flatMap((piece) => (piece.length > max ? hardSplit(piece, max) : [piece]));
}

function hardSplit(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = "";

  for (const word of words) {
    if ((buf + " " + word).trim().length > max) {
      if (buf) out.push(buf.trim());
      buf = word;
    } else {
      buf = (buf + " " + word).trim();
    }
  }
  if (buf) out.push(buf.trim());

  // A single "word" longer than the limit (no whitespace) still has to fit.
  return out.flatMap((piece) => {
    if (piece.length <= max) return [piece];
    const chunks: string[] = [];
    for (let i = 0; i < piece.length; i += max) chunks.push(piece.slice(i, i + max));
    return chunks;
  });
}

/** Glue stray one-line fragments onto their neighbour so playback isn't choppy. */
function mergeTinyPieces(pieces: string[]): string[] {
  const out: string[] = [];

  for (const piece of pieces) {
    const previous = out[out.length - 1];
    if (
      previous &&
      piece.length < SEGMENT_MIN_CHARS &&
      previous.length + piece.length + 1 <= SEGMENT_MAX_CHARS
    ) {
      out[out.length - 1] = `${previous} ${piece}`;
      continue;
    }
    out.push(piece);
  }

  return out.filter((p) => p.trim().length > 0);
}

export function preview(text: string, length = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= length ? clean : `${clean.slice(0, length - 1).trimEnd()}…`;
}
