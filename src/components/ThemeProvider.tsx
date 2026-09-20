"use client";

import { App, ConfigProvider, theme } from "antd";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#b4531a",
          colorLink: "#b4531a",
          borderRadius: 12,
          fontSize: 15,
          colorBgLayout: "#f7f5f2",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif',
        },
        components: {
          Button: { controlHeight: 44, controlHeightLG: 52, fontWeight: 500 },
          Input: { controlHeight: 44 },
          Select: { controlHeight: 44 },
          Card: { paddingLG: 16 },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
