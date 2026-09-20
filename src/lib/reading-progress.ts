import type { ReadingMode } from "./reading-mode";

export type ReadingProgress = {
  bookId: string;
  segmentIndex: number;
  playlistSize: number;
  pageNumber: number;
  locateBy: "chapter" | "page";
  chapterIndex?: number;
  startPage?: number;
  chapterTitle?: string | null;
  readingMode: ReadingMode;
  updatedAt: number;
};

function storageKey(bookId: string) {
  return `reading-progress-${bookId}`;
}

export function getReadingProgress(bookId: string): ReadingProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(bookId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadingProgress;
    if (parsed.bookId !== bookId) return null;
    if (typeof parsed.segmentIndex !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveReadingProgress(progress: ReadingProgress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(progress.bookId), JSON.stringify(progress));
}

export function clearReadingProgress(bookId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(bookId));
}

export function buildReaderHref(bookId: string, progress: ReadingProgress): string {
  const mode = `mode=${progress.readingMode}`;
  const segment = `segment=${progress.segmentIndex}`;
  if (progress.locateBy === "chapter" && progress.chapterIndex != null) {
    return `/book/${bookId}/read?chapter=${progress.chapterIndex}&${segment}&${mode}`;
  }
  const page = progress.startPage ?? progress.pageNumber;
  return `/book/${bookId}/read?page=${page}&${segment}&${mode}`;
}

export function progressSummary(progress: ReadingProgress): string {
  const part =
    progress.playlistSize > 0
      ? ` · भाग ${progress.segmentIndex + 1}/${progress.playlistSize}`
      : "";
  if (progress.locateBy === "chapter" && progress.chapterTitle) {
    return `${progress.chapterTitle} · पेज ${progress.pageNumber}${part}`;
  }
  return `पेज ${progress.pageNumber}${part}`;
}
