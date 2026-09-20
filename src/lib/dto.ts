import type { Book, Chapter, Segment } from "@prisma/client";
import { preview } from "./segment";
import type { BookDto, ChapterDto, SegmentDto } from "./types";

export function toBookDto(book: Book): BookDto {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    pageCount: book.pageCount,
    chapterCount: book.chapterCount,
    wordCount: book.wordCount,
    status: book.status as BookDto["status"],
    statusMessage: book.statusMessage,
    processedPages: book.processedPages,
    simplifyStyle: book.simplifyStyle as BookDto["simplifyStyle"],
    defaultSpeaker: book.defaultSpeaker,
    enabled: book.enabled,
    createdAt: book.createdAt.toISOString(),
  };
}

export function toChapterDto(chapter: Chapter): ChapterDto {
  return {
    id: chapter.id,
    index: chapter.index,
    title: chapter.title,
    startPage: chapter.startPage,
    endPage: chapter.endPage,
  };
}

export function toSegmentDto(segment: Segment, hasAudio: boolean): SegmentDto {
  return {
    id: segment.id,
    index: segment.index,
    pageNumber: segment.pageNumber,
    pageIndex: segment.pageIndex,
    preview: preview(segment.sourceText),
    sourceText: segment.sourceText,
    hasAudio,
    status: segment.status as SegmentDto["status"],
  };
}
