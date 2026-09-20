/**
 * Client-safe copy of the bulbul:v3 speaker list.
 * (`lib/sarvam.ts` is server-only — it reads env vars and uses Buffer.)
 */
export const BULBUL_SPEAKERS = [
  "shubh",
  "aditya",
  "rahul",
  "rohan",
  "amit",
  "dev",
  "ritu",
  "priya",
  "neha",
  "pooja",
  "simran",
  "kavya",
  "ishita",
  "shreya",
] as const;

export type BulbulSpeaker = (typeof BULBUL_SPEAKERS)[number];
