"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, InputNumber, Segmented, Skeleton, Typography } from "antd";
import { ArrowLeftOutlined, PlayCircleFilled } from "@ant-design/icons";
import { apiGet } from "@/lib/client";
import {
  bothModesAvailableDescription,
  modeDescription,
  parseReadingMode,
  readingModeStorageKey,
  type ReadingMode,
} from "@/lib/reading-mode";
import { ContinueReadingCard } from "@/components/ContinueReadingCard";
import type { BookDto, ChapterDto } from "@/lib/types";

export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [book, setBook] = useState<BookDto | null>(null);
  const [chapters, setChapters] = useState<ChapterDto[]>([]);
  const [mode, setMode] = useState<"chapter" | "page">("chapter");
  const [pageNumber, setPageNumber] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>("hinglish");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ book: BookDto; chapters: ChapterDto[] }>(`/api/books/${id}`)
      .then((data) => {
        setBook(data.book);
        setChapters(data.chapters);
        const stored = localStorage.getItem(readingModeStorageKey(id));
        setReadingMode(parseReadingMode(stored, data.book.simplifyStyle));
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  const persistMode = (next: ReadingMode) => {
    setReadingMode(next);
    localStorage.setItem(readingModeStorageKey(id), next);
  };

  const readQuery = (extra: string) => {
    const q = extra ? `${extra}&mode=${readingMode}` : `mode=${readingMode}`;
    return q;
  };

  if (error) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <Typography.Text type="danger">{error}</Typography.Text>
          <div style={{ marginTop: 16 }}>
            <Link href="/">← वापस</Link>
          </div>
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
          onClick={() => router.push("/")}
          aria-label="वापस"
        />
        <div style={{ minWidth: 0 }}>
          <h1>{book?.title ?? "…"}</h1>
          {book?.author && <p className="sub">{book.author}</p>}
        </div>
      </header>

      <main className="app-main">
        {!book && <Skeleton active paragraph={{ rows: 4 }} />}

            {book && (
              <>
                <ContinueReadingCard bookId={id} />

                <div
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid #f1dcc9",
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 14,
                    lineHeight: 1.6,
                    marginTop: 16,
                  }}
                >
                  {bothModesAvailableDescription()}
                </div>

                <p className="section-title" style={{ marginTop: 16 }}>
                  सुनने का मोड
                </p>
                <Segmented
                  block
                  size="large"
                  value={readingMode}
                  onChange={(value) => persistMode(value as ReadingMode)}
                  options={[
                    { label: "हिंग्लिश", value: "hinglish" },
                    { label: "सरल हिंदी", value: "hindi" },
                  ]}
                />
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  {modeDescription(readingMode)}
                </p>

                <p className="section-title" style={{ marginTop: 20 }}>
                  या नया स्थान चुनें
                </p>

            <Segmented
              block
              size="large"
              value={mode}
              onChange={(value) => setMode(value as "chapter" | "page")}
              options={[
                { label: "अध्याय से", value: "chapter" },
                { label: "पेज नंबर से", value: "page" },
              ]}
            />

            {mode === "chapter" && (
              <div className="card-list" style={{ marginTop: 16 }}>
                {chapters.map((chapter) => (
                  <Link
                    key={chapter.id}
                    href={`/book/${id}/read?${readQuery(`chapter=${chapter.index}`)}`}
                  >
                    <article className="book-card" style={{ alignItems: "center" }}>
                      <div
                        className="book-cover"
                        style={{ width: 36, height: 36, borderRadius: 10, fontSize: 14 }}
                      >
                        {chapter.index}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h2 className="book-title" style={{ fontSize: 14.5 }}>
                          {chapter.title}
                        </h2>
                        <p className="book-meta">
                          पेज {chapter.startPage}–{chapter.endPage}
                        </p>
                      </div>
                      <PlayCircleFilled style={{ fontSize: 24, color: "var(--accent)" }} />
                    </article>
                  </Link>
                ))}
              </div>
            )}

            {mode === "page" && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <InputNumber
                  size="large"
                  style={{ width: "100%" }}
                  min={1}
                  max={book.pageCount}
                  value={pageNumber}
                  onChange={(value) => setPageNumber(Number(value) || 1)}
                  addonBefore="पेज"
                  addonAfter={`/ ${book.pageCount}`}
                  inputMode="numeric"
                />
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<PlayCircleFilled />}
                  onClick={() =>
                    router.push(`/book/${id}/read?${readQuery(`page=${pageNumber}`)}`)
                  }
                >
                  यहाँ से सुनना शुरू करें
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
