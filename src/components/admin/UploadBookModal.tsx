"use client";

import { useState } from "react";
import { App as AntApp, Alert, Form, Input, Modal, Progress, Select, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { InboxOutlined } from "@ant-design/icons";
import { apiSend } from "@/lib/client";
import { BULBUL_SPEAKERS } from "@/lib/speakers";
import type { BookDto } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (book: BookDto) => void;
}

interface FormValues {
  title: string;
  author?: string;
  description?: string;
  simplifyStyle: "hinglish" | "hindi";
  defaultSpeaker: string;
}

export default function UploadBookModal({ open, onClose, onCreated }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    form.resetFields();
    setFile(null);
    setPercent(0);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!file) {
      setError("Choose a PDF first");
      return;
    }

    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    setUploading(true);
    try {
      // 1. Ask the server for a presigned PUT
      const { url, key } = await apiSend<{ url: string; key: string }>(
        "/api/admin/upload-url",
        "POST",
        { filename: file.name, contentType: "application/pdf" },
      );

      // 2. Upload straight to object storage (XHR so we get progress)
      await uploadToStorage(url, file, setPercent);

      // 3. Register the book
      const { book } = await apiSend<{ book: BookDto }>("/api/admin/books", "POST", {
        ...values,
        sourceKey: key,
      });

      message.success("Uploaded — processing now");
      reset();
      onCreated(book);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Add a book"
      okText="Upload and process"
      confirmLoading={uploading}
      onOk={submit}
      onCancel={() => {
        if (uploading) return;
        reset();
        onClose();
      }}
      maskClosable={!uploading}
      width={520}
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}

      <Form
        form={form}
        layout="vertical"
        initialValues={{ simplifyStyle: "hinglish", defaultSpeaker: "shubh" }}
        disabled={uploading}
      >
        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: "Title is required" }]}
        >
          <Input placeholder="Atomic Habits" />
        </Form.Item>

        <Form.Item name="author" label="Author">
          <Input placeholder="James Clear" />
        </Form.Item>

        <Form.Item name="description" label="Short description">
          <Input.TextArea rows={2} maxLength={400} showCount />
        </Form.Item>

        <Form.Item
          name="simplifyStyle"
          label="Default reading mode"
          tooltip="Which mode is selected first when someone opens this book. They can switch anytime."
        >
          <Select
            options={[
              { value: "hinglish", label: "Hinglish (default)" },
              { value: "hindi", label: "Simple Hindi (default)" },
            ]}
          />
        </Form.Item>

        <Form.Item name="defaultSpeaker" label="Default voice">
          <Select
            showSearch
            options={BULBUL_SPEAKERS.map((value) => ({
              value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            }))}
          />
        </Form.Item>
      </Form>

      <Upload.Dragger
        accept="application/pdf,.pdf"
        maxCount={1}
        disabled={uploading}
        beforeUpload={(candidate) => {
          if (candidate.type !== "application/pdf") {
            message.error("Only PDF files are supported");
            return Upload.LIST_IGNORE;
          }
          setFile(candidate as unknown as File);
          return false; // we upload to storage ourselves
        }}
        onRemove={() => setFile(null)}
        fileList={
          file
            ? ([{ uid: "1", name: file.name, status: "done" }] as UploadFile[])
            : []
        }
      >
        <p style={{ margin: 0, fontSize: 28, color: "var(--accent)" }}>
          <InboxOutlined />
        </p>
        <p style={{ margin: "6px 0 0" }}>Drop the PDF here or click to choose</p>
        <p style={{ margin: 0, fontSize: 12, color: "#8c8c8c" }}>
          Text-based PDFs only — scanned images need OCR first
        </p>
      </Upload.Dragger>

      {uploading && <Progress percent={percent} style={{ marginTop: 12 }} />}
    </Modal>
  );
}

function uploadToStorage(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", "application/pdf");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Upload failed — check your network connection."));

    xhr.send(file);
  });
}
