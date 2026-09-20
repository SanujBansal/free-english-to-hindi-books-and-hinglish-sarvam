/**
 * Thin, typed client for the Sarvam AI APIs used by this app.
 *
 * Docs: https://docs.sarvam.ai
 *   POST /text-to-speech        bulbul:v3   (<= 2500 chars per request)
 *   POST /translate             sarvam-translate:v1 (<= 2000) / mayura:v1 (<= 1000)
 *   POST /v1/chat/completions   sarvam-105b (128K context)
 *
 * Auth is a single header: `api-subscription-key: <key>`.
 * (The chat endpoint additionally accepts `Authorization: Bearer <key>` for
 * OpenAI-compatible tooling, but we use the native header everywhere.)
 */
import { optionalEnv, requireEnv } from "./env";

export const SARVAM_LIMITS = {
  /** bulbul:v3 REST limit */
  ttsMaxChars: 2500,
  /** sarvam-translate:v1 limit (mayura:v1 is 1000) */
  translateMaxChars: 2000,
} as const;

export { BULBUL_SPEAKERS, type BulbulSpeaker } from "./speakers";

export type SarvamLanguage =
  | "hi-IN"
  | "bn-IN"
  | "ta-IN"
  | "te-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "pa-IN"
  | "od-IN"
  | "en-IN";

function baseUrl() {
  return optionalEnv("SARVAM_BASE_URL", "https://api.sarvam.ai").replace(/\/+$/, "");
}

export class SarvamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "SarvamError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST JSON to Sarvam with exponential backoff on 429 / 5xx.
 * Rate limits are per-account and fairly low on the Starter plan
 * (30 req/min for bulbul:v3), so backing off matters.
 */
async function sarvamPost<T>(
  path: string,
  body: unknown,
  { retries = 4, timeoutMs = 120_000 }: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const key = requireEnv("SARVAM_API_KEY");

  let lastError: SarvamError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "api-subscription-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return (await res.json()) as T;

      const text = await res.text();
      lastError = new SarvamError(
        `Sarvam ${path} failed with ${res.status}`,
        res.status,
        text.slice(0, 1000),
      );

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === retries) throw lastError;

      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30_000, 1500 * 2 ** attempt) + Math.random() * 500;
      await sleep(waitMs);
    } catch (err) {
      if (err instanceof SarvamError) throw err;
      lastError = new SarvamError(
        `Sarvam ${path} request error: ${(err as Error).message}`,
        0,
        "",
      );
      if (attempt === retries) throw lastError;
      await sleep(Math.min(20_000, 1500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new SarvamError(`Sarvam ${path} failed`, 0, "");
}

/* ------------------------------------------------------------------ */
/* Chat completions — used to rewrite English into easy Hinglish        */
/* ------------------------------------------------------------------ */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface ChatResponse {
  choices: {
    message: { role: string; content: string | null; reasoning_content?: string | null };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: "json_object" | "text" };
  } = {},
): Promise<string> {
  const res = await sarvamPost<ChatResponse>("/v1/chat/completions", {
    model: opts.model ?? optionalEnv("SARVAM_CHAT_MODEL", "sarvam-105b"),
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2048,
    stream: false,
    reasoning_effort: null,
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
  });

  const choice = res.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (content) return content;

  const finish = choice?.finish_reason ?? "unknown";
  throw new SarvamError(
    finish === "length"
      ? "Sarvam chat hit the token limit before producing text — try a shorter passage"
      : "Sarvam chat returned no content",
    0,
    JSON.stringify(res).slice(0, 500),
  );
}

/* ------------------------------------------------------------------ */
/* Translate                                                            */
/* ------------------------------------------------------------------ */

export type TranslateMode = "formal" | "classic-colloquial" | "modern-colloquial" | "code-mixed";
export type OutputScript = "roman" | "fully-native" | "spoken-form-in-native" | null;

interface TranslateResponse {
  request_id: string;
  translated_text: string;
  source_language_code: string;
}

export async function translateText(params: {
  input: string;
  sourceLanguage?: string;
  targetLanguage?: SarvamLanguage;
  mode?: TranslateMode;
  outputScript?: OutputScript;
  numeralsFormat?: "international" | "native";
  model?: string;
}): Promise<string> {
  if (params.input.length > SARVAM_LIMITS.translateMaxChars) {
    throw new Error(
      `translateText: input is ${params.input.length} chars, limit is ${SARVAM_LIMITS.translateMaxChars}`,
    );
  }

  const res = await sarvamPost<TranslateResponse>("/translate", {
    input: params.input,
    source_language_code: params.sourceLanguage ?? "en-IN",
    target_language_code: params.targetLanguage ?? "hi-IN",
    mode: params.mode ?? "modern-colloquial",
    model: params.model ?? optionalEnv("SARVAM_TRANSLATE_MODEL", "sarvam-translate:v1"),
    output_script: params.outputScript ?? null,
    numerals_format: params.numeralsFormat ?? "international",
  });

  return res.translated_text;
}

/* ------------------------------------------------------------------ */
/* Text to speech                                                       */
/* ------------------------------------------------------------------ */

interface TtsResponse {
  request_id: string;
  /** base64-encoded WAV chunks */
  audios: string[];
}

/**
 * Render text to a single WAV buffer. Text longer than the API limit is split
 * on sentence boundaries and the resulting WAVs are stitched together.
 */
export async function textToSpeech(params: {
  text: string;
  languageCode?: SarvamLanguage;
  speaker?: string;
  model?: string;
  pace?: number;
  temperature?: number;
  sampleRate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100 | 48000;
}): Promise<{ wav: Buffer; sampleRate: number }> {
  const model = params.model ?? optionalEnv("SARVAM_TTS_MODEL", "bulbul:v3");
  const sampleRate = params.sampleRate ?? 24000;
  const chunks = splitForTts(params.text, SARVAM_LIMITS.ttsMaxChars - 100);

  const wavs: Buffer[] = [];
  for (const chunk of chunks) {
    const res = await sarvamPost<TtsResponse>("/text-to-speech", {
      text: chunk,
      language_code: params.languageCode ?? "hi-IN",
      speaker: params.speaker ?? optionalEnv("SARVAM_TTS_SPEAKER", "shubh"),
      model,
      pace: params.pace ?? 1.0,
      temperature: params.temperature ?? 0.6,
      speech_sample_rate: sampleRate,
    });

    for (const b64 of res.audios ?? []) {
      wavs.push(Buffer.from(b64, "base64"));
    }
  }

  if (wavs.length === 0) throw new SarvamError("Sarvam TTS returned no audio", 0, "");
  return { wav: concatWav(wavs), sampleRate };
}

/** Split text into <= maxChars pieces, preferring sentence then word boundaries. */
export function splitForTts(text: string, maxChars: number): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return [clean];

  const sentences = clean.match(/[^.!?।\n]+[.!?।\n]*/g) ?? [clean];
  const out: string[] = [];
  let buf = "";

  const push = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      push();
      // Hard-split an over-long sentence on word boundaries.
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if ((buf + " " + word).trim().length > maxChars) push();
        buf = (buf + " " + word).trim();
      }
      push();
      continue;
    }
    if ((buf + sentence).length > maxChars) push();
    buf += sentence;
  }
  push();

  // Last resort: a "word" longer than the limit (no whitespace at all) still has
  // to fit, so chop it on character boundaries.
  return out.flatMap((piece) => (piece.length > maxChars ? chopEvery(piece, maxChars) : [piece]));
}

function chopEvery(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.filter(Boolean);
}

/**
 * Concatenate PCM WAV buffers that share the same format.
 * Sarvam returns 16-bit mono PCM WAV, so the fmt chunk of the first file is reused.
 */
export function concatWav(buffers: Buffer[]): Buffer {
  if (buffers.length === 1) return buffers[0];

  const parsed = buffers.map(parseWav).filter((p): p is ParsedWav => p !== null);
  if (parsed.length === 0) return buffers[0];
  if (parsed.length === 1) return buffers[0];

  const { header } = parsed[0];
  const data = Buffer.concat(parsed.map((p) => p.data));

  const out = Buffer.alloc(header.length + data.length);
  header.copy(out, 0);
  data.copy(out, header.length);

  // Patch RIFF size and data chunk size.
  out.writeUInt32LE(out.length - 8, 4);
  out.writeUInt32LE(data.length, header.length - 4);
  return out;
}

interface ParsedWav {
  /** everything up to and including the `data` chunk size field */
  header: Buffer;
  data: Buffer;
}

function parseWav(buf: Buffer): ParsedWav | null {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF") return null;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;

    if (id === "data") {
      const end = Math.min(buf.length, bodyStart + size);
      return { header: buf.subarray(0, bodyStart), data: buf.subarray(bodyStart, end) };
    }
    offset = bodyStart + size + (size % 2);
  }
  return null;
}
