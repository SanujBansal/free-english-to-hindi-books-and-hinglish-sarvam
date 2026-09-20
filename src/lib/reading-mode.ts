import type { SimplifyStyle } from "./simplify";

export type ReadingMode = SimplifyStyle;

export function parseReadingMode(value: unknown, fallback: ReadingMode = "hinglish"): ReadingMode {
  return value === "hindi" ? "hindi" : value === "hinglish" ? "hinglish" : fallback;
}

export function readingModeStorageKey(bookId: string): string {
  return `reading-mode-${bookId}`;
}

export function parseGlosses(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const meaning = String(raw ?? "").trim();
    if (meaning) out[key.toLowerCase()] = meaning;
  }
  return out;
}

export function modeLabel(style: SimplifyStyle): string {
  return style === "hindi" ? "सरल हिंदी" : "हिंग्लिश";
}

export function modeDescription(style: SimplifyStyle): string {
  return style === "hindi"
    ? "सरल हिंदी — कोई अंग्रेज़ी शब्द नहीं।"
    : "हिंग्लिश — अंग्रेज़ी शब्दों पर टैप करके मतलब देखें।";
}

export function bothModesAvailableDescription(): string {
  return "हर हिस्से के लिए हिंग्लिश और सरल हिंदी दोनों तैयार होते हैं। नीचे से मोड बदलें।";
}
