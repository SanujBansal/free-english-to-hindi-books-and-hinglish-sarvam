# Suno — English books, read aloud in easy Hindi

A Next.js app that takes an English PDF book, breaks it into chapters and pages,
rewrites each passage into simple spoken Hinglish with **sarvam-105b**, and narrates
it with **bulbul:v3**. Built to deploy on Vercel with S3 for files and Postgres for metadata.

```
PDF in S3 ──► pdfjs text + outline ──► pages, chapters, segments in Postgres
                                              │
        reader taps play ─────────────────────┤
                                              ▼
                            sarvam-105b  (English → easy Hinglish)
                                              ▼
                            bulbul:v3    (Hinglish → WAV)
                                              ▼
                            WAV cached in S3, presigned URL to the browser
```

Every rewrite and every WAV is cached, so the first listener pays for the API calls
and everyone after that gets it free.

---

## 1. Prerequisites

| Thing | Where |
|---|---|
| Sarvam API key | <https://dashboard.sarvam.ai> — ₹100 free credits on signup |
| Postgres | [Neon](https://neon.tech) free tier, or Vercel Postgres |
| S3 bucket | Any AWS account, ideally `ap-south-1` |
| Node | 20 or newer |

## 2. Local setup

```bash
npm install
cp .env.example .env.local     # fill in every value
npm run db:push                # creates the tables
npm run dev
```

Open <http://localhost:3000> for the reader and <http://localhost:3000/admin> for the console.

## 3. S3 bucket configuration

The browser uploads PDFs **straight to S3** with a presigned URL, which avoids
Vercel's 4.5 MB request body limit. That needs a CORS rule on the bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.vercel.app"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Keep **Block all public access ON** — nothing is served publicly, the app hands
out short-lived presigned URLs instead.

The IAM user needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`,
`s3:ListBucket` and `s3:HeadObject` on `arn:aws:s3:::your-bucket/*`.

## 4. Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. **Environment variables (required)** — copy from your local `.env` after `neon env pull` / `neon deploy`:
   - `DATABASE_URL` (Neon **pooled** URL) — without this, `/api/books` returns 500/503
   - `SARVAM_API_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
   - Neon Object Storage: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_S3_BUCKET=books`
3. **Production schema** — once `DATABASE_URL` is set on Vercel, apply the schema to that same Neon branch (from your machine):

   ```bash
   DATABASE_URL="postgresql://…" npx prisma db push
   ```

4. Redeploy. `npm run build` runs `prisma generate` so the client matches `schema.prisma`.

If the library shows an error JSON mentioning `DATABASE_URL` or schema, fix step 2 or 3 above.

On the **Hobby** plan serverless functions stop at 60 s. Ingestion is already
batched around that (15 pages per request), but if you move to Pro you can raise
`maxDuration` in `src/app/api/admin/books/[id]/process/route.ts` and the batch size
in the same file.

---

## 5. How the app is laid out

```
src/
  app/
    page.tsx                         library (mobile-first)
    book/[id]/page.tsx               chapter / page picker
    book/[id]/read/page.tsx          reader shell
    admin/page.tsx                   admin console
    admin/login/page.tsx             password gate
    api/
      books/                         public: list, detail, segments
      speak/                         narrate one segment (LLM + TTS + cache)
      admin/                         upload URL, CRUD, batched processing
  components/
    Reader.tsx                       player: prefetch, auto-advance, voice, speed
    admin/UploadBookModal.tsx        presigned S3 upload
  lib/
    sarvam.ts                        API client: chat, translate, TTS, WAV stitching
    simplify.ts                      the Hinglish rewrite prompt
    pdf.ts                           pdfjs text + outline extraction
    chapters.ts                      chapter detection and page ranges
    segment.ts                       paragraph → TTS-sized segments
    s3.ts / prisma.ts / auth.ts      infrastructure
prisma/schema.prisma
```

### The admin flow

1. **Add book** — the PDF goes to S3, a `Book` row is created with `status: uploaded`.
2. **Process** — the console calls `/process` in a loop, 15 pages at a time. Each batch
   extracts page text, stores a `Page`, and splits it into `Segment` rows. On the last
   batch chapters are written and `status` flips to `ready`.
3. **Live toggle** — only `enabled && ready` books appear in the public library.

Chapters come from the PDF's own outline when it has one. When it doesn't, headings
are detected from the first lines of each page (`Chapter 4`, `Part II`, `3. Something`).
Failing both, the whole book becomes one chapter and readers pick by page number.

### The reader flow

`/book/<id>/read?chapter=3` or `?page=42` loads the segment playlist. Tapping play
posts to `/api/speak`, which:

1. returns a presigned URL immediately if that segment+voice is already rendered;
2. otherwise asks sarvam-105b to rewrite the passage (cached on the segment row);
3. sends that to bulbul:v3, stores the WAV in S3, returns the URL.

The player prefetches the next segment while the current one plays, so there is no
gap between paragraphs. Readers can switch voice, change speed, and reveal the
original English under the Hindi.

---

## 6. Sarvam API notes

Base URL `https://api.sarvam.ai`, single auth header `api-subscription-key: <key>`.

| Endpoint | Model | Limit that matters |
|---|---|---|
| `POST /text-to-speech` | `bulbul:v3` | 2,500 chars per request; returns base64 WAV in `audios[]` |
| `POST /v1/chat/completions` | `sarvam-105b` | 128K context; also accepts `Authorization: Bearer` |
| `POST /translate` | `sarvam-translate:v1` | 2,000 chars (`mayura:v1` is 1,000) |
| `POST /speech-to-text` | `saaras:v3` | not used here — useful if you add audiobook alignment |

Rate limits are **per account**, not per key. On the Starter plan bulbul:v3 is
30 req/min, which is why `lib/sarvam.ts` backs off on 429 and why segments are
generated on demand rather than pre-rendering an entire book.

TTS voices used by the picker: shubh (default), aditya, rahul, rohan, amit, dev,
ritu, priya, neha, pooja, simran, kavya, ishita, shreya.

`lib/sarvam.ts` also exposes `translateText()` with `mode: "code-mixed"` if you ever
want faithful translation instead of the LLM rewrite — swap the call in
`src/app/api/speak/route.ts`.

## 7. Cost shape

Per segment (~700 chars of English) you pay one sarvam-105b completion of roughly
400 output tokens plus one bulbul:v3 render of roughly 900 characters. A 300-page
book is on the order of 2,000 segments — but only the passages someone actually
listens to are ever generated, and never twice.

## 8. Things deliberately left out

- **Scanned PDFs.** Text extraction assumes a real text layer. For image-only PDFs,
  route pages through Sarvam's Document Intelligence (Sarvam Vision) API first.
- **Real user accounts.** The admin is one shared password in an HMAC-signed cookie.
  Swap `lib/auth.ts` for NextAuth or Clerk when you need more.
- **Resume position.** The reader starts where you tell it. Add a `Progress` model
  keyed by user once accounts exist.
- **Word-level highlighting.** Would need the TTS timestamp output.
