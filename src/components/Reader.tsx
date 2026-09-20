"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Segmented, Select, Skeleton, Switch, Tag, Typography } from "antd";
import {
  ArrowLeftOutlined,
  CaretRightFilled,
  LoadingOutlined,
  PauseOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from "@ant-design/icons";
import { apiGet, apiSend } from "@/lib/client";
import { HinglishPassage } from "@/components/HinglishPassage";
import {
  bothModesAvailableDescription,
  modeLabel,
  parseReadingMode,
  readingModeStorageKey,
  type ReadingMode,
} from "@/lib/reading-mode";
import { saveReadingProgress } from "@/lib/reading-progress";
import { BULBUL_SPEAKERS } from "@/lib/speakers";
import type { SegmentDto, SpeakResponse } from "@/lib/types";

interface SegmentsResponse {
  bookId: string;
  bookTitle: string;
  chapterTitle: string | null;
  startPage: number;
  endPage: number;
  defaultSpeaker: string;
  /** Default mode when opening this book */
  defaultReadingMode: "hinglish" | "hindi";
  segments: SegmentDto[];
}

const SPEEDS = [0.75, 1, 1.25, 1.5];
/** Refetch a narration rather than trust a presigned URL near its expiry. */
const URL_TTL_MS = 45 * 60 * 1000;

export default function Reader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const search = useSearchParams();

  const chapter = search.get("chapter");
  const page = search.get("page");
  const modeParam = search.get("mode");
  const segmentParam = search.get("segment");

  const [data, setData] = useState<SegmentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("hinglish");

  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadingSegment, setLoadingSegment] = useState(false);
  const [speaker, setSpeaker] = useState<string>("shubh");
  const [rate, setRate] = useState(1);
  const [showSource, setShowSource] = useState(false);

  /** segmentId + speaker -> rendered audio (presigned URLs live one hour) */
  const cache = useRef<Map<string, { res: SpeakResponse; fetchedAt: number }>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayRef = useRef(false);

  useEffect(() => {
    if (chapter || page) return;
    router.replace(`/book/${id}`);
  }, [bookId, chapter, page, router]);

  const query = useMemo(() => {
    if (chapter) return `chapter=${encodeURIComponent(chapter)}`;
    if (page) return `page=${encodeURIComponent(page)}`;
    return "";
  }, [chapter, page]);

  /* ---------------- load the playlist ---------------- */

  useEffect(() => {
    let cancelled = false;

    apiGet<SegmentsResponse>(`/api/books/${bookId}/segments?${query}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setSpeaker(res.defaultSpeaker || "shubh");
        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem(readingModeStorageKey(bookId))
            : null;
        setReadingMode(
          parseReadingMode(modeParam ?? stored, res.defaultReadingMode ?? "hinglish"),
        );
      })
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [bookId, query, modeParam]);

  useEffect(() => {
    if (!data?.segments.length) return;
    const idx =
      segmentParam != null && Number.isFinite(Number(segmentParam))
        ? Math.min(Math.max(0, Number(segmentParam)), data.segments.length - 1)
        : 0;
    setCurrent(idx);
  }, [data, query, segmentParam]);

  const changeReadingMode = useCallback(
    (mode: ReadingMode) => {
      setReadingMode(mode);
      localStorage.setItem(readingModeStorageKey(bookId), mode);
      audioRef.current?.pause();
      setPlaying(false);
    },
    [bookId],
  );

  /* ---------------- audio element ---------------- */

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onEnded = () => {
      autoPlayRef.current = true;
      setCurrent((index) => index + 1);
    };
    const onError = () => {
      setPlaying(false);
      setError("ऑडियो चलाने में दिक्कत हुई। दोबारा कोशिश करें।");
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, current]);

  /* ---------------- narration fetch + cache ---------------- */

  const fetchNarration = useCallback(
    async (segment: SegmentDto): Promise<SpeakResponse> => {
      const key = `${segment.id}:${speaker}:${readingMode}`;
      const hit = cache.current.get(key);
      if (hit && Date.now() - hit.fetchedAt < URL_TTL_MS) return hit.res;

      const res = await apiSend<SpeakResponse>("/api/speak", "POST", {
        segmentId: segment.id,
        speaker,
        mode: readingMode,
      });
      cache.current.set(key, { res, fetchedAt: Date.now() });
      return res;
    },
    [speaker, readingMode],
  );

  const segments = data?.segments ?? [];
  const activeSegment = segments[current];
  const activeNarration = activeSegment
    ? cache.current.get(`${activeSegment.id}:${speaker}:${readingMode}`)?.res
    : undefined;

  useEffect(() => {
    if (!data || !activeSegment) return;
    saveReadingProgress({
      bookId,
      segmentIndex: current,
      playlistSize: segments.length,
      pageNumber: activeSegment.pageNumber,
      locateBy: chapter ? "chapter" : "page",
      chapterIndex: chapter != null ? Number(chapter) : undefined,
      startPage: page != null ? Number(page) : activeSegment.pageNumber,
      chapterTitle: data.chapterTitle,
      readingMode,
      updatedAt: Date.now(),
    });
  }, [
    bookId,
    chapter,
    page,
    current,
    readingMode,
    data,
    segments.length,
    activeSegment?.pageNumber,
    activeSegment?.id,
  ]);

  /* Load (and optionally start) whatever segment is current. */
  useEffect(() => {
    if (!activeSegment) return;
    let cancelled = false;

    const shouldAutoPlay = autoPlayRef.current;
    autoPlayRef.current = false;

    setLoadingSegment(true);
    setError(null);

    fetchNarration(activeSegment)
      .then((narration) => {
        if (cancelled || !audioRef.current) return;

        audioRef.current.src = narration.audioUrl;
        audioRef.current.playbackRate = rate;
        setLoadingSegment(false);

        if (shouldAutoPlay || playing) {
          void audioRef.current.play().catch(() => setPlaying(false));
        }

        // Warm the next one so playback does not stall between paragraphs.
        const next = segments[current + 1];
        if (next) void fetchNarration(next).catch(() => undefined);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadingSegment(false);
        setPlaying(false);
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // `playing` intentionally excluded: toggling play/pause must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment?.id, speaker, readingMode, current]);

  /* ---------------- controls ---------------- */

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !activeSegment) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    setPlaying(true);
    if (audio.src) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      autoPlayRef.current = true;
    }
  }, [playing, activeSegment]);

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= segments.length) return;
      audioRef.current?.pause();
      autoPlayRef.current = playing;
      setCurrent(index);
    },
    [segments.length, playing],
  );

  const finished = data && current >= segments.length && segments.length > 0;

  /* ---------------- render ---------------- */

  if (error && !data) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <Alert type="error" message={error} showIcon />
          <Button style={{ marginTop: 16 }} onClick={() => router.push(`/book/${bookId}`)}>
            वापस जाएँ
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Button
          type="text"
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(`/book/${bookId}`)}
          aria-label="वापस"
        />
        <div style={{ minWidth: 0 }}>
          <h1>{data?.chapterTitle ?? data?.bookTitle ?? "…"}</h1>
          <p className="sub">
            {activeSegment
              ? `पेज ${activeSegment.pageNumber} · ${current + 1}/${segments.length}`
              : data
                ? `पेज ${data.startPage}–${data.endPage}`
                : ""}
          </p>
        </div>
      </header>

      <main className={`app-main${segments.length > 0 ? " app-main--with-player" : ""}`}>
        {!data && <Skeleton active paragraph={{ rows: 6 }} />}

        {data && segments.length === 0 && (
          <Alert
            type="warning"
            showIcon
            message="इस हिस्से में पढ़ने लायक टेक्स्ट नहीं मिला"
            description="शायद ये पेज सिर्फ़ तस्वीरें हैं। कोई और अध्याय चुनें।"
          />
        )}

        {error && data && (
          <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} closable />
        )}

        {finished && (
          <Alert
            type="success"
            showIcon
            message="यह हिस्सा पूरा हुआ"
            description="अगला अध्याय चुनने के लिए वापस जाएँ।"
            style={{ marginBottom: 12 }}
          />
        )}

        {data && segments.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Segmented
              block
              value={readingMode}
              onChange={(value) => changeReadingMode(value as ReadingMode)}
              options={[
                { label: "हिंग्लिश", value: "hinglish" },
                { label: "सरल हिंदी", value: "hindi" },
              ]}
            />
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
              {bothModesAvailableDescription()}
            </p>
          </div>
        )}

        {activeSegment && (
          <>
            <div className="chip-row" style={{ marginBottom: 12 }}>
              <Tag
                color={readingMode === "hindi" ? "green" : "orange"}
                style={{ margin: 0, borderRadius: 999 }}
              >
                {modeLabel(readingMode)}
              </Tag>
              <Tag style={{ margin: 0, borderRadius: 999 }}>
                पेज {activeSegment.pageNumber}
              </Tag>
              {activeNarration?.cached && (
                <Tag style={{ margin: 0, borderRadius: 999 }}>सेव किया हुआ</Tag>
              )}
            </div>

            {loadingSegment && !activeNarration ? (
              <div className="reader-text">
                <Typography.Text type="secondary">
                  <LoadingOutlined />{" "}
                  {readingMode === "hindi"
                    ? "सरल हिंदी में बदला जा रहा है…"
                    : "हिंग्लिश में बदला जा रहा है…"}
                </Typography.Text>
              </div>
            ) : readingMode === "hinglish" ? (
              <>
                <HinglishPassage
                  text={activeNarration?.hinglishText ?? activeSegment.preview}
                  glosses={activeNarration?.glosses ?? {}}
                />
                <p className="hinglish-hint">अंग्रेज़ी शब्द (रेखांकित) पर टैप करके मतलब देखें</p>
              </>
            ) : (
              <div className="reader-text hindi-only">
                {activeNarration?.hinglishText ?? activeSegment.preview}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <Switch
                size="small"
                checked={showSource}
                onChange={setShowSource}
                id="show-source"
              />
              <label htmlFor="show-source" style={{ fontSize: 13, color: "var(--muted)" }}>
                मूल अंग्रेज़ी दिखाएँ
              </label>
            </div>

            {showSource && <div className="reader-source">{activeSegment.sourceText}</div>}
          </>
        )}
      </main>

      {segments.length > 0 && (
        <div className="player-bar">
          <div className="player-inner">
            <div className="progress-line">
              <span>
                {Math.min(current + 1, segments.length)} / {segments.length}
              </span>
              <span>
                <Select
                  size="small"
                  variant="borderless"
                  value={rate}
                  onChange={setRate}
                  style={{ width: 72 }}
                  options={SPEEDS.map((value) => ({ value, label: `${value}×` }))}
                />
                <Select
                  size="small"
                  variant="borderless"
                  value={speaker}
                  onChange={(value) => {
                    audioRef.current?.pause();
                    setPlaying(false);
                    setSpeaker(value);
                  }}
                  style={{ width: 104 }}
                  options={BULBUL_SPEAKERS.map((value) => ({
                    value,
                    label: value.charAt(0).toUpperCase() + value.slice(1),
                  }))}
                />
              </span>
            </div>

            <div className="player-controls">
              <button
                className="icon-button"
                onClick={() => goTo(current - 1)}
                disabled={current === 0}
                aria-label="पिछला"
              >
                <StepBackwardOutlined />
              </button>

              <button
                className="play-button"
                onClick={togglePlay}
                disabled={!activeSegment}
                aria-label={playing ? "रोकें" : "चलाएँ"}
              >
                {loadingSegment ? (
                  <LoadingOutlined />
                ) : playing ? (
                  <PauseOutlined />
                ) : (
                  <CaretRightFilled />
                )}
              </button>

              <button
                className="icon-button"
                onClick={() => goTo(current + 1)}
                disabled={current >= segments.length - 1}
                aria-label="अगला"
              >
                <StepForwardOutlined />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
