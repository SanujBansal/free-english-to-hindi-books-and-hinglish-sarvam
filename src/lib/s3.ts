import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { optionalEnv, requireEnv } from "./env";

/** Neon Object Storage bucket declared in `neon.ts` (`preview.buckets.books`). */
const BOOKS_BUCKET = "books";

let client: S3Client | null = null;

export function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.AWS_ENDPOINT_URL_S3;
    client = new S3Client({
      region: requireEnv("AWS_REGION"),
      forcePathStyle: true,
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

export function bucket(): string {
  return optionalEnv("AWS_S3_BUCKET", BOOKS_BUCKET);
}

/** Presigned PUT so the browser uploads the PDF straight to Neon Object Storage (no 4.5MB Vercel body limit). */
export async function presignUpload(key: string, contentType: string, expiresIn = 900) {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3(), command, { expiresIn });
}

export async function presignDownload(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(s3(), command, { expiresIn });
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return key;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const body = res.Body as unknown as AsyncIterable<Uint8Array> | undefined;
  if (!body) throw new Error(`S3 object ${key} has no body`);

  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteKeys(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 1000) {
    const batch = unique.slice(i, i + 1000);
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      }),
    );
  }
}

/** Every key under a prefix, paginated. */
export async function listPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

/** books/<bookId>/source.pdf, books/<bookId>/audio/<segment>-<speaker>.wav */
export const s3Keys = {
  source: (bookId: string, ext = "pdf") => `books/${bookId}/source.${ext}`,
  upload: (uploadId: string, filename: string) =>
    `uploads/${uploadId}/${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
  audio: (bookId: string, segmentId: string, speaker: string, mode: string) =>
    `books/${bookId}/audio/${segmentId}-${speaker}-${mode}.wav`,
  prefix: (bookId: string) => `books/${bookId}/`,
};
