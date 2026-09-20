import { NextRequest, NextResponse } from "next/server";
import { toSegmentDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * The reader's playlist.
 *   ?page=12        -> just that page
 *   ?chapter=3      -> every page in that chapter
 *   ?from=40&to=44  -> an explicit page range
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const search = req.nextUrl.searchParams;

  const book = await prisma.book.findFirst({
    where: { id, enabled: true, status: "ready" },
    select: { id: true, title: true, pageCount: true, defaultSpeaker: true, simplifyStyle: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let startPage = 1;
  let endPage = book.pageCount;
  let chapterTitle: string | null = null;

  const chapterParam = search.get("chapter");
  const pageParam = search.get("page");

  if (chapterParam) {
    const chapter = await prisma.chapter.findUnique({
      where: { bookId_index: { bookId: id, index: Number(chapterParam) } },
    });
    if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    startPage = chapter.startPage;
    endPage = chapter.endPage;
    chapterTitle = chapter.title;
  } else if (pageParam) {
    const page = Math.min(Math.max(1, Number(pageParam) || 1), book.pageCount);
    startPage = page;
    endPage = Number(search.get("to")) || page;
  } else {
    startPage = Math.max(1, Number(search.get("from")) || 1);
    endPage = Math.min(book.pageCount, Number(search.get("to")) || book.pageCount);
  }

  const segments = await prisma.segment.findMany({
    where: { bookId: id, pageNumber: { gte: startPage, lte: endPage } },
    orderBy: { index: "asc" },
    include: { audios: { select: { id: true } } },
  });

  return NextResponse.json({
    bookId: id,
    bookTitle: book.title,
    chapterTitle,
    startPage,
    endPage,
    defaultSpeaker: book.defaultSpeaker,
    defaultReadingMode: book.simplifyStyle === "hindi" ? "hindi" : "hinglish",
    segments: segments.map((segment) => toSegmentDto(segment, segment.audios.length > 0)),
  });
}
