"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Empty, Input, Skeleton, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { apiGet } from "@/lib/client";
import type { BookDto } from "@/lib/types";

export default function LibraryPage() {
  const [books, setBooks] = useState<BookDto[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ books: BookDto[] }>("/api/books")
      .then((data) => setBooks(data.books))
      .catch((err: Error) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!books) return null;
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (book) =>
        book.title.toLowerCase().includes(q) || (book.author ?? "").toLowerCase().includes(q),
    );
  }, [books, query]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>सुनो — किताबें आसान हिंदी में</h1>
          <p className="sub">English books, explained aloud in simple Hindi</p>
        </div>
      </header>

      <main className="app-main">
        <Input
          size="large"
          allowClear
          prefix={<SearchOutlined style={{ color: "#a39c95" }} />}
          placeholder="किताब या लेखक खोजें"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <p className="section-title">
          {filtered ? `${filtered.length} किताबें` : "लोड हो रहा है"}
        </p>

        {error && <Typography.Text type="danger">{error}</Typography.Text>}

        {!filtered && !error && (
          <div className="card-list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="book-card">
                <Skeleton active paragraph={{ rows: 1 }} />
              </div>
            ))}
          </div>
        )}

        {filtered?.length === 0 && (
          <Empty
            style={{ marginTop: 48 }}
            description="अभी कोई किताब उपलब्ध नहीं है"
          />
        )}

        <div className="card-list">
          {filtered?.map((book) => (
            <Link key={book.id} href={`/book/${book.id}`}>
              <article className="book-card">
                <div className="book-cover">{book.title.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <h2 className="book-title">{book.title}</h2>
                  <p className="book-meta">
                    {book.author ? `${book.author} · ` : ""}
                    {book.chapterCount} अध्याय · {book.pageCount} पेज
                  </p>
                  {book.description && (
                    <p className="book-meta" style={{ marginTop: 6 }}>
                      {book.description.length > 110
                        ? `${book.description.slice(0, 110)}…`
                        : book.description}
                    </p>
                  )}
                </div>
              </article>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
