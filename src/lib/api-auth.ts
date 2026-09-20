import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "./auth";

/** Returns a 401 response when the caller is not an authenticated admin. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  const ok = await verifySessionToken(store.get(ADMIN_COOKIE)?.value);
  if (ok) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
