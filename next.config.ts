import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfjs-dist must not be bundled by webpack/turbopack — it needs to load its
  // own legacy build + fake worker at runtime inside the Node serverless function.
  serverExternalPackages: ["pdfjs-dist"],
  transpilePackages: [
    "antd",
    "@ant-design/icons",
    "@ant-design/nextjs-registry",
    "rc-util",
    "rc-pagination",
    "rc-picker",
    "rc-notification",
    "rc-tooltip",
  ],
};

export default nextConfig;
