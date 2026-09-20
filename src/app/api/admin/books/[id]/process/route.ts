import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api-auth";
import { buildChapterRanges, detectChaptersFromPages } from "@/lib/chapters";
import { countWords, loadPdf, stripNullBytes } from "@/lib/pdf";
import { prisma } from "@/lib/prisma";
import { deleteKeys, getObjectBuffer, listPrefix } from "@/lib/s3";
import { segmentPageText } from "@/lib/segment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Hobby caps this at 60s; Pro allows up to 300. */
export const maxDuration = 60;

const DEFAULT_BATCH = 15;

type Params = { params: Promise<{ id: string }> };

/**
 * Ingestion runs in page batches so a long book never hits the function
 * timeout. The admin UI calls this repeatedly until `done` comes back true.
 *
 *   POST { from: 0, reset: true }   -> wipes and starts over
 *   POST { from: 15 }               -> processes pages 16..30
 */
export async function POST(req: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const from = Math.max(0, Number(body?.from ?? 0) | 0);
  const batchSize = Math.min(60, Math.max(1, Number(body?.batchSize ?? DEFAULT_BATCH) | 0));
  const reset = Boolean(body?.reset) || from === 0;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return jsonError("Book not found", 404);

  let pdf: Awaited<ReturnType<typeof loadPdf>> | null = null;

  try {
    const bytes = await getObjectBuffer(book.sourceKey);
    pdf = await loadPdf(bytes);
    const pageCount = pdf.numPages;

    if (reset) {
      await wipeDerivedData(id);
      await prisma.book.update({
        where: { id },
        data: {
          status: "processing",
          statusMessage: null,
          processedPages: 0,
          pageCount,
          chapterCount: 0,
          wordCount: 0,
          enabled: false,
        },
      });
    }

    const start = from + 1;
    const end = Math.min(pageCount, from + batchSize);

    if (start > pageCount) {
      return NextResponse.json({ processedPages: pageCount, pageCount, done: true });
    }

    let segmentIndex = await prisma.segment.count({ where: { bookId: id } });
    let wordsInBatch = 0;

    for (let pageNumber = start; pageNumber <= end; pageNumber++) {
      const text = await pdf.getPageText(pageNumber);
      wordsInBatch += countWords(text);

      await prisma.page.upsert({
        where: { bookId_number: { bookId: id, number: pageNumber } },
        create: { bookId: id, number: pageNumber, text, charCount: text.length },
        update: { text, charCount: text.length },
      });

      const pieces = segmentPageText(text);
      if (pieces.length === 0) continue;

      await prisma.segment.createMany({
        data: pieces.map((sourceText, pageIndex) => ({
          bookId: id,
          index: segmentIndex + pageIndex,
          pageNumber,
          pageIndex,
          sourceText,
        })),
        skipDuplicates: true,
      });
      segmentIndex += pieces.length;
    }

    const done = end >= pageCount;

    await prisma.book.update({
      where: { id },
      data: {
        processedPages: end,
        pageCount,
        wordCount: { increment: wordsInBatch },
        status: "processing",
      },
    });

    if (done) {
      const chapterCount = await finaliseChapters(id, pdf, pageCount);
      await prisma.book.update({
        where: { id },
        data: { status: "ready", statusMessage: null, chapterCount },
      });
      return NextResponse.json({
        processedPages: pageCount,
        pageCount,
        chapterCount,
        segmentCount: segmentIndex,
        done: true,
      });
    }

    return NextResponse.json({
      processedPages: end,
      pageCount,
      segmentCount: segmentIndex,
      done: false,
      next: end,
    });
  } catch (error) {
    const message = (error as Error).message ?? "Processing failed";
    await prisma.book
      .update({ where: { id }, data: { status: "failed", statusMessage: message.slice(0, 500) } })
      .catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await pdf?.destroy();
  }
}

async function wipeDerivedData(bookId: string) {
  const audioKeys = await listPrefix(`books/${bookId}/audio/`).catch(() => []);
  if (audioKeys.length) await deleteKeys(audioKeys).catch(() => undefined);

  // Audio rows cascade from Segment, Segment/Page/Chapter cascade from Book.
  await prisma.segment.deleteMany({ where: { bookId } });
  await prisma.page.deleteMany({ where: { bookId } });
  await prisma.chapter.deleteMany({ where: { bookId } });
}

/** Prefer the PDF's own outline; fall back to heading heuristics over the extracted text. */
async function finaliseChapters(
  bookId: string,
  pdf: Awaited<ReturnType<typeof loadPdf>>,
  pageCount: number,
): Promise<number> {
  let starts = await pdf.getOutlineChapters().catch(() => []);

  if (starts.length < 2) {
    const pages = await prisma.page.findMany({
      where: { bookId },
      select: { number: true, text: true },
      orderBy: { number: "asc" },
    });
    const detected = detectChaptersFromPages(pages);
    if (detected.length > starts.length) starts = detected;
  }

  const chapters = buildChapterRanges(starts, pageCount);

  await prisma.chapter.deleteMany({ where: { bookId } });
  await prisma.chapter.createMany({
    data: chapters.map((chapter) => ({
      bookId,
      index: chapter.index,
      title: stripNullBytes(chapter.title),
      startPage: chapter.startPage,
      endPage: chapter.endPage,
    })),
  });

  return chapters.length;
}
