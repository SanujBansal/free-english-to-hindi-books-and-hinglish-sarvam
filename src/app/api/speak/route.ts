import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseReadingMode } from "@/lib/reading-mode";
import { ensureSegmentVariants } from "@/lib/segment-variants";
import { presignDownload, putObject, s3Keys } from "@/lib/s3";
import { BULBUL_SPEAKERS, textToSpeech } from "@/lib/sarvam";
import type { SpeakResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const segmentId = String(body?.segmentId ?? "").trim();
  if (!segmentId) return NextResponse.json({ error: "segmentId is required" }, { status: 400 });

  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          enabled: true,
          status: true,
          simplifyStyle: true,
          defaultSpeaker: true,
        },
      },
    },
  });

  if (!segment || !segment.book.enabled || segment.book.status !== "ready") {
    return NextResponse.json({ error: "Segment not available" }, { status: 404 });
  }

  const mode = parseReadingMode(body?.mode, parseReadingMode(segment.book.simplifyStyle));

  const requested = String(
    body?.speaker ?? (segment.book.defaultSpeaker || "shubh"),
  ).toLowerCase();
  const speaker = (BULBUL_SPEAKERS as readonly string[]).includes(requested)
    ? requested
    : segment.book.defaultSpeaker;

  try {
    const { hinglishText, hindiText, glosses } = await ensureSegmentVariants(
      segment,
      segment.book.title,
    );

    const narrationText = mode === "hindi" ? hindiText : hinglishText;

    const cached = await prisma.audio.findUnique({
      where: {
        segmentId_speaker_readingMode: { segmentId, speaker, readingMode: mode },
      },
    });

    if (cached) {
      const audioUrl = await presignDownload(cached.s3Key);
      return NextResponse.json<SpeakResponse>({
        segmentId,
        audioUrl,
        hinglishText: narrationText,
        sourceText: segment.sourceText,
        speaker,
        cached: true,
        readingMode: mode,
        glosses: mode === "hinglish" ? glosses : undefined,
      });
    }

    const { wav, sampleRate } = await textToSpeech({
      text: narrationText,
      languageCode: "hi-IN",
      speaker,
    });

    const key = s3Keys.audio(segment.bookId, segmentId, speaker, mode);
    await putObject(key, wav, "audio/wav");

    await prisma.audio.upsert({
      where: {
        segmentId_speaker_readingMode: { segmentId, speaker, readingMode: mode },
      },
      create: { segmentId, speaker, readingMode: mode, s3Key: key, bytes: wav.length, sampleRate },
      update: { s3Key: key, bytes: wav.length, sampleRate },
    });

    await prisma.segment.update({
      where: { id: segmentId },
      data: { status: "ready", error: null },
    });

    const audioUrl = await presignDownload(key);

    return NextResponse.json<SpeakResponse>({
      segmentId,
      audioUrl,
      hinglishText: narrationText,
      sourceText: segment.sourceText,
      speaker,
      cached: false,
      readingMode: mode,
      glosses: mode === "hinglish" ? glosses : undefined,
    });
  } catch (error) {
    const message = (error as Error).message ?? "Narration failed";
    await prisma.segment
      .update({ where: { id: segmentId }, data: { status: "failed", error: message.slice(0, 500) } })
      .catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
