"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  App as AntApp,
  Button,
  Popconfirm,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import UploadBookModal from "@/components/admin/UploadBookModal";
import { apiGet, apiSend } from "@/lib/client";
import type { BookDto } from "@/lib/types";

const STATUS_COLOR: Record<string, string> = {
  uploaded: "default",
  processing: "processing",
  ready: "success",
  failed: "error",
};

export default function AdminPage() {
  const router = useRouter();
  const { message } = AntApp.useApp();

  const [books, setBooks] = useState<BookDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ books: BookDto[] }>("/api/admin/books");
      setBooks(data.books);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ingestion is batched so no single request hits the function timeout.
   * We keep calling /process until it reports done.
   */
  const processBook = useCallback(
    async (book: BookDto) => {
      setBusyId(book.id);
      const hide = message.loading(`Processing “${book.title}”…`, 0);

      try {
        let from = 0;
        let done = false;
        let guard = 0;

        while (!done && guard++ < 500) {
          const res = await apiSend<{
            processedPages: number;
            pageCount: number;
            done: boolean;
            next?: number;
          }>(`/api/admin/books/${book.id}/process`, "POST", {
            from,
            reset: from === 0,
          });

          done = res.done;
          from = res.next ?? res.processedPages;

          setBooks((list) =>
            list.map((b) =>
              b.id === book.id
                ? {
                    ...b,
                    processedPages: res.processedPages,
                    pageCount: res.pageCount,
                    status: done ? "ready" : "processing",
                  }
                : b,
            ),
          );
        }

        message.success("Processed");
      } catch (err) {
        message.error((err as Error).message);
      } finally {
        hide();
        setBusyId(null);
        void load();
      }
    },
    [load, message],
  );

  const toggleEnabled = useCallback(
    async (book: BookDto, enabled: boolean) => {
      try {
        await apiSend(`/api/admin/books/${book.id}`, "PATCH", { enabled });
        setBooks((list) => list.map((b) => (b.id === book.id ? { ...b, enabled } : b)));
      } catch (err) {
        message.error((err as Error).message);
      }
    },
    [message],
  );

  const setDefaultMode = useCallback(
    async (book: BookDto, simplifyStyle: "hinglish" | "hindi") => {
      try {
        await apiSend(`/api/admin/books/${book.id}`, "PATCH", { simplifyStyle });
        setBooks((list) => list.map((b) => (b.id === book.id ? { ...b, simplifyStyle } : b)));
      } catch (err) {
        message.error((err as Error).message);
      }
    },
    [message],
  );

  const remove = useCallback(
    async (book: BookDto) => {
      try {
        await apiSend(`/api/admin/books/${book.id}`, "DELETE");
        setBooks((list) => list.filter((b) => b.id !== book.id));
        message.success("Deleted");
      } catch (err) {
        message.error((err as Error).message);
      }
    },
    [message],
  );

  const logout = async () => {
    await apiSend("/api/admin/logout", "POST").catch(() => undefined);
    router.replace("/admin/login");
  };

  const columns: ColumnsType<BookDto> = [
    {
      title: "Book",
      dataIndex: "title",
      render: (_value, book) => (
        <div>
          <div style={{ fontWeight: 600 }}>{book.title}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {book.author || "Unknown author"}
            {book.pageCount ? ` · ${book.pageCount} pages` : ""}
            {book.chapterCount ? ` · ${book.chapterCount} chapters` : ""}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 190,
      render: (_value, book) => (
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Tag color={STATUS_COLOR[book.status] ?? "default"}>{book.status}</Tag>
          {book.status === "processing" && book.pageCount > 0 && (
            <Progress
              percent={Math.round((book.processedPages / book.pageCount) * 100)}
              size="small"
            />
          )}
          {book.statusMessage && (
            <Typography.Text type="danger" style={{ fontSize: 11 }}>
              {book.statusMessage}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: "Default",
      dataIndex: "simplifyStyle",
      width: 130,
      render: (value: string, book) => (
        <Select
          size="small"
          value={value === "hindi" ? "hindi" : "hinglish"}
          style={{ width: 118 }}
          options={[
            { value: "hinglish", label: "Hinglish" },
            { value: "hindi", label: "Hindi" },
          ]}
          onChange={(v) => setDefaultMode(book, v as "hinglish" | "hindi")}
        />
      ),
    },
    {
      title: "Live",
      dataIndex: "enabled",
      width: 90,
      render: (_value, book) => (
        <Switch
          checked={book.enabled}
          disabled={book.status !== "ready"}
          onChange={(checked) => toggleEnabled(book, checked)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 230,
      render: (_value, book) => (
        <Space>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={busyId === book.id}
            onClick={() => processBook(book)}
          >
            {book.status === "ready" ? "Reprocess" : "Process"}
          </Button>
          {book.enabled && (
            <Link href={`/book/${book.id}`} target="_blank">
              <Button size="small" type="link">
                Open
              </Button>
            </Link>
          )}
          <Popconfirm
            title="Delete this book?"
            description="Removes the PDF, cached audio and all metadata."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(book)}
          >
            <Button size="small" danger type="text">
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-shell">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Books
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Upload a PDF, process it, then switch it live for readers.
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>
            Add book
          </Button>
          <Button type="text" onClick={logout}>
            Sign out
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={books}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
      />

      <UploadBookModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(book) => {
          setBooks((list) => [book, ...list]);
          setUploadOpen(false);
          void processBook(book);
        }}
      />
    </div>
  );
}
