import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api-auth";
import { toBookDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";
import { objectExists } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const books = await prisma.book.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ books: books.map(toBookDto) });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const sourceKey = String(body?.sourceKey ?? "").trim();

  if (!title) return jsonError("title is required");
  if (!sourceKey) return jsonError("sourceKey is required — upload the PDF first");
  if (!(await objectExists(sourceKey))) {
    return jsonError("That S3 object does not exist. Did the upload finish?");
  }

  const book = await prisma.book.create({
    data: {
      title,
      author: body?.author ? String(body.author).trim() : null,
      description: body?.description ? String(body.description).trim() : null,
      sourceKey,
      sourceType: "pdf",
      simplifyStyle: body?.simplifyStyle === "hindi" ? "hindi" : "hinglish",
      defaultSpeaker: body?.defaultSpeaker ? String(body.defaultSpeaker) : "shubh",
      status: "uploaded",
      enabled: false,
    },
  });

  return NextResponse.json({ book: toBookDto(book) }, { status: 201 });
}
