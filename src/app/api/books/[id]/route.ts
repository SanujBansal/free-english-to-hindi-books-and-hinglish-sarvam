import { NextRequest, NextResponse } from "next/server";
import { toBookDto, toChapterDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const book = await prisma.book.findFirst({
    where: { id, enabled: true, status: "ready" },
    include: { chapters: { orderBy: { index: "asc" } } },
  });

  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  return NextResponse.json({
    book: toBookDto(book),
    chapters: book.chapters.map(toChapterDto),
  });
}
