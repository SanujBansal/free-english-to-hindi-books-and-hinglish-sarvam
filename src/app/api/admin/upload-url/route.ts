import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api-auth";
import { presignUpload, s3Keys } from "@/lib/s3";

export const runtime = "nodejs";

/**
 * The browser PUTs the PDF straight to S3 with this URL, which sidesteps
 * Vercel's request body limit entirely. Requires a CORS rule on the bucket
 * allowing PUT from your app origin — see README.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const filename = String(body?.filename ?? "").trim();
  const contentType = String(body?.contentType ?? "application/pdf");

  if (!filename) return jsonError("filename is required");
  if (contentType !== "application/pdf") return jsonError("Only PDF uploads are supported");

  const key = s3Keys.upload(randomUUID(), filename);
  const url = await presignUpload(key, contentType);

  return NextResponse.json({ key, url, contentType });
}
