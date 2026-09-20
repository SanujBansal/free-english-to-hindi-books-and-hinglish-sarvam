"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Typography } from "antd";
import { PlayCircleFilled } from "@ant-design/icons";
import {
  buildReaderHref,
  getReadingProgress,
  progressSummary,
  type ReadingProgress,
} from "@/lib/reading-progress";

export function ContinueReadingCard({ bookId }: { bookId: string }) {
  const [progress, setProgress] = useState<ReadingProgress | null>(null);

  useEffect(() => {
    setProgress(getReadingProgress(bookId));
  }, [bookId]);

  if (!progress) return null;

  return (
    <section className="continue-card">
      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
        जहाँ छोड़ा था
      </Typography.Text>
      <p className="continue-card-title">{progressSummary(progress)}</p>
      <Link href={buildReaderHref(bookId, progress)}>
        <Button type="primary" size="large" block icon={<PlayCircleFilled />}>
          यहीं से जारी रखें
        </Button>
      </Link>
    </section>
  );
}
