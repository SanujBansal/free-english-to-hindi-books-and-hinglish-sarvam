/**
 * Minimal admin session: a single shared password, an HMAC-signed cookie.
 *
 * Uses Web Crypto so the same code runs in middleware (edge runtime) and in
 * Node route handlers. Swap this for NextAuth/Clerk when you need real users.
 */
export const ADMIN_COOKIE = "ab_admin";

const encoder = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("ADMIN_SESSION_SECRET is not set");
  return value;
}

/** Token format: `<issuedAtMs>.<hmac>` */
export async function createSessionToken(ttlMs = 1000 * 60 * 60 * 12): Promise<string> {
  const expiresAt = Date.now() + ttlMs;
  const key = await hmacKey(secret());
  const sig = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiresAt))));
  return `${expiresAt}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiresAtRaw, sig] = token.split(".");
  if (!expiresAtRaw || !sig) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  try {
    const key = await hmacKey(secret());
    const expected = toHex(
      await crypto.subtle.sign("HMAC", key, encoder.encode(expiresAtRaw)),
    );
    return safeEqual(expected, sig);
  } catch {
    return false;
  }
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD is not set");
  return safeEqual(expected, candidate);
}
