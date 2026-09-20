import { Suspense } from "react";
import { Skeleton } from "antd";
import Reader from "@/components/Reader";

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <main className="app-main">
            <Skeleton active paragraph={{ rows: 6 }} />
          </main>
        </div>
      }
    >
      <Reader bookId={id} />
    </Suspense>
  );
}
