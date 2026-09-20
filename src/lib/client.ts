"use client";

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error((await errorMessage(res)) ?? `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await errorMessage(res)) ?? `Request failed (${res.status})`);
  return (await res.json()) as T;
}

async function errorMessage(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    return typeof data?.error === "string" ? data.error : null;
  } catch {
    return null;
  }
}
