import { prisma } from "@/lib/prisma";
import { parseGlosses } from "@/lib/reading-mode";
import { simplifyToHinglish } from "@/lib/simplify";

type SegmentRow = {
  id: string;
  bookId: string;
  index: number;
  pageNumber: number;
  sourceText: string;
  hinglishText: string | null;
  hinglishGlosses: unknown;
  hindiText: string | null;
};

/** Generate missing Hinglish + Hindi rewrites for one segment (parallel LLM calls). */
export async function ensureSegmentVariants(
  segment: SegmentRow,
  bookTitle: string,
): Promise<{ hinglishText: string; hindiText: string; glosses: Record<string, string> }> {
  let hinglishText = segment.hinglishText ?? "";
  let hindiText = segment.hindiText ?? "";
  let glosses = parseGlosses(segment.hinglishGlosses);

  const needsHinglish = !hinglishText || Object.keys(glosses).length === 0;
  const needsHindi = !hindiText;

  if (!needsHinglish && !needsHindi) {
    return { hinglishText, hindiText, glosses };
  }

  const chapter = await prisma.chapter.findFirst({
    where: {
      bookId: segment.bookId,
      startPage: { lte: segment.pageNumber },
      endPage: { gte: segment.pageNumber },
    },
    select: { title: true },
  });

  const previous =
    segment.index > 0
      ? await prisma.segment.findUnique({
          where: { bookId_index: { bookId: segment.bookId, index: segment.index - 1 } },
          select: { sourceText: true },
        })
      : null;

  const context = {
    bookTitle,
    chapterTitle: chapter?.title,
    previousTail: previous?.sourceText.slice(-300),
  };

  const [hinglishResult, hindiResult] = await Promise.all([
    needsHinglish
      ? simplifyToHinglish(segment.sourceText, "hinglish", context)
      : Promise.resolve(null),
    needsHindi ? simplifyToHinglish(segment.sourceText, "hindi", context) : Promise.resolve(null),
  ]);

  if (hinglishResult) {
    hinglishText = hinglishResult.text;
    glosses = hinglishResult.glosses;
  }
  if (hindiResult) {
    hindiText = hindiResult.text;
  }

  const hinglishChanged = segment.hinglishText && segment.hinglishText !== hinglishText;
  const hindiChanged = segment.hindiText && segment.hindiText !== hindiText;
  if (hinglishChanged || hindiChanged) {
    await prisma.audio.deleteMany({ where: { segmentId: segment.id } });
  }

  await prisma.segment.update({
    where: { id: segment.id },
    data: {
      hinglishText,
      hinglishGlosses: glosses,
      hindiText,
      status: "pending",
      error: null,
    },
  });

  return { hinglishText, hindiText, glosses };
}
