export type BookStatus = "uploaded" | "processing" | "ready" | "failed";

export interface BookDto {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  pageCount: number;
  chapterCount: number;
  wordCount: number;
  status: BookStatus;
  statusMessage: string | null;
  processedPages: number;
  simplifyStyle: "hinglish" | "hindi";
  defaultSpeaker: string;
  enabled: boolean;
  createdAt: string;
}

export interface ChapterDto {
  id: string;
  index: number;
  title: string;
  startPage: number;
  endPage: number;
}

export interface SegmentDto {
  id: string;
  index: number;
  pageNumber: number;
  pageIndex: number;
  preview: string;
  sourceText: string;
  hasAudio: boolean;
  status: "pending" | "ready" | "failed";
}

export interface SpeakResponse {
  segmentId: string;
  audioUrl: string;
  hinglishText: string;
  sourceText: string;
  speaker: string;
  cached: boolean;
  readingMode: "hinglish" | "hindi";
  glosses?: Record<string, string>;
}

export const READING_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
