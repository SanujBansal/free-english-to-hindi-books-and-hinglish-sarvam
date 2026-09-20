import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api-auth";
import { toBookDto, toChapterDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { deleteKeys, listPrefix, s3Keys } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: { chapters: { orderBy: { index: "asc" } } },
  });
  if (!book) return jsonError("Book not found", 404);

  const audioCount = await prisma.audio.count({ where: { segment: { bookId: id } } });
  const segmentCount = await prisma.segment.count({ where: { bookId: id } });

  return NextResponse.json({
    book: toBookDto(book),
    chapters: book.chapters.map(toChapterDto),
    segmentCount,
    audioCount,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Invalid body");

  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) return jsonError("Book not found", 404);

  if (body.enabled === true && existing.status !== "ready") {
    return jsonError("Process the book before enabling it");
  }

  const book = await prisma.book.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.author !== undefined ? { author: body.author ? String(body.author) : null } : {}),
      ...(body.description !== undefined
        ? { description: body.description ? String(body.description) : null }
        : {}),
      ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
      ...(body.simplifyStyle !== undefined
        ? { simplifyStyle: body.simplifyStyle === "hindi" ? "hindi" : "hinglish" }
        : {}),
      ...(body.defaultSpeaker !== undefined ? { defaultSpeaker: String(body.defaultSpeaker) } : {}),
    },
  });

  return NextResponse.json({ book: toBookDto(book) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return jsonError("Book not found", 404);

  // Cached audio + anything else stored under the book prefix, then the source PDF.
  const bookObjects = await listPrefix(s3Keys.prefix(id)).catch(() => []);
  await deleteKeys([...bookObjects, book.sourceKey]).catch(() => undefined);

  // Chapters / pages / segments / audio rows cascade from the Book row.
  await prisma.book.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
