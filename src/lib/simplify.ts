/**
 * Turns a slice of English book text into easy spoken Hinglish (or simple Hindi)
 * using sarvam-105b, then hands the result to bulbul:v3 for narration.
 */
import { chatComplete } from "./sarvam";

export type SimplifyStyle = "hinglish" | "hindi";

export type SimplifyResult = {
  text: string;
  /** English loanword (lowercase key) -> short Hindi explanation — hinglish mode only */
  glosses: Record<string, string>;
};

const HINGLISH_SYSTEM = `You convert passages from English books into easy spoken Hinglish for Indian listeners who understand little English.

Rules:
- Write mostly in Devanagari script using everyday spoken Hindi.
- Keep common English words that Indians use daily (school, company, computer, market, team, project, idea, book, etc.) in LATIN script (English spelling), mixed into the Hindi sentences.
- If the passage contains a difficult idea, term or metaphor, explain it in one short extra sentence in simple words.
- Keep every name, number, date and quantity exactly as in the original.
- Keep the author's meaning and order. Do not add opinions, do not summarise away content, do not skip sentences.
- Break long English sentences into short spoken sentences.
- The output will be read aloud by TTS — no markdown, bullets, or footnote markers in the passage.

Respond with a single JSON object (no markdown fence):
{
  "passage": "<rewritten passage with Latin-script English loanwords>",
  "glosses": {
    "<english word lowercase>": "<short Hindi meaning in Devanagari, 2–8 words>"
  }
}
Include a glosses entry for every Latin-script English word you use in the passage.`;

const HINDI_SYSTEM = `You convert passages from English books into simple, clear Hindi for listeners with little English.

Rules:
- Write ONLY in Devanagari script using simple, commonly understood Hindi.
- Do NOT use English words or Latin letters anywhere in the output.
- Avoid heavy Sanskritised vocabulary; prefer the word an ordinary speaker would use.
- If a difficult idea or term appears, explain it in one short extra sentence.
- Keep every name, number, date and quantity exactly as in the original.
- Preserve the author's meaning and order. Do not summarise or skip content.
- Output ONLY the rewritten passage. No preamble, headings, markdown or notes.
- The output will be read aloud, so avoid symbols like *, #, _ and footnote markers.`;

export function systemPromptFor(style: SimplifyStyle): string {
  return style === "hindi" ? HINDI_SYSTEM : HINGLISH_SYSTEM;
}

/** Strip the wrappers an LLM sometimes adds despite instructions. */
export function cleanModelOutput(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fence) text = fence[1].trim();

  const devanagariStart = text.search(/[ऀ-ॿ]/);
  if (devanagariStart > 0) {
    const before = text.slice(0, devanagariStart);
    if (/^[^ऀ-ॿ]{0,160}$/.test(before) && /[:\-\n]\s*$/.test(before)) {
      text = text.slice(devanagariStart);
    }
  }

  return text
    .replace(/^["'«]|["'»]$/g, "")
    .replace(/[*_#]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normaliseGlosses(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const meaning = String(value ?? "").trim();
    if (meaning) out[key.toLowerCase()] = meaning;
  }
  return out;
}

function parseHinglishPayload(raw: string): SimplifyResult {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as { passage?: string; text?: string; glosses?: unknown };
    const passage = cleanModelOutput(String(parsed.passage ?? parsed.text ?? ""));
    if (!passage) throw new Error("empty passage");
    return { text: passage, glosses: normaliseGlosses(parsed.glosses) };
  } catch {
    return { text: cleanModelOutput(trimmed), glosses: {} };
  }
}

/**
 * @param text        one segment of the original English book text
 * @param style       hinglish (Devanagari + English loanwords) or hindi (Devanagari only)
 */
export async function simplifyToHinglish(
  text: string,
  style: SimplifyStyle = "hinglish",
  context?: { bookTitle?: string; chapterTitle?: string; previousTail?: string },
): Promise<SimplifyResult> {
  const contextLines: string[] = [];
  if (context?.bookTitle) contextLines.push(`Book: ${context.bookTitle}`);
  if (context?.chapterTitle) contextLines.push(`Chapter: ${context.chapterTitle}`);
  if (context?.previousTail) {
    contextLines.push(
      `End of the previous passage (for continuity only — do NOT re-translate it):\n${context.previousTail}`,
    );
  }

  const user = [
    contextLines.join("\n"),
    contextLines.length ? "\n---\n" : "",
    "Rewrite this passage:\n\n",
    text,
  ].join("");

  const raw = await chatComplete(
    [{ role: "system", content: systemPromptFor(style) }, { role: "user", content: user }],
    {
      temperature: 0.3,
      maxTokens: 3072,
      responseFormat: style === "hinglish" ? { type: "json_object" } : undefined,
    },
  );

  if (style === "hinglish") {
    const parsed = parseHinglishPayload(raw);
    if (!parsed.text) throw new Error("Simplification returned empty text");
    return parsed;
  }

  const cleaned = cleanModelOutput(raw);
  if (!cleaned) throw new Error("Simplification returned empty text");
  return { text: cleaned, glosses: {} };
}
