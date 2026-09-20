import { NextRequest, NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/api-db";
import { toBookDto } from "@/lib/dto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public library: only books an admin has processed and switched on. */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();

    const books = await prisma.book.findMany({
      where: {
        enabled: true,
        status: "ready",
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { author: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ books: books.map(toBookDto) });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
