"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, Input, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { apiSend } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/admin";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiSend("/api/admin/login", "POST", { password });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Admin
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Upload and manage books.
        </Typography.Paragraph>

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}

        <Input.Password
          size="large"
          prefix={<LockOutlined />}
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={submit}
          autoFocus
        />
        <Button
          type="primary"
          size="large"
          block
          style={{ marginTop: 12 }}
          loading={loading}
          onClick={submit}
          disabled={!password}
        >
          Sign in
        </Button>
      </Card>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
