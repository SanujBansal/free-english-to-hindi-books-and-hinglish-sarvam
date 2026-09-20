import { NextResponse } from "next/server";

/** Map Prisma / Postgres failures to a safe JSON API response. */
export function databaseErrorResponse(error: unknown) {
  console.error("[database]", error);

  const message = error instanceof Error ? error.message : String(error);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error:
          "Database is not configured on this deployment. Set DATABASE_URL in the host environment (e.g. Vercel → Settings → Environment Variables).",
      },
      { status: 503 },
    );
  }

  if (/does not exist|relation .* does not exist|P2021|P1001|P1000/i.test(message)) {
    return NextResponse.json(
      {
        error:
          "Database schema is missing or unreachable. Run `npx prisma db push` against the production DATABASE_URL, then redeploy.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: "Database request failed" }, { status: 500 });
}
