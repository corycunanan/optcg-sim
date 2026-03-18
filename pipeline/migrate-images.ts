/**
 * Image Migration: Database → Cloudflare R2
 *
 * Reads all card and art-variant image URLs from the database,
 * downloads any that aren't already hosted on R2, uploads them
 * to Cloudflare R2, and updates the database with the new CDN URLs.
 *
 * Usage:
 *   pnpm pipeline:migrate-images [--dry-run] [--concurrency <n>] [--limit <n>]
 *
 * Required env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, NEXT_PUBLIC_CDN_URL, DATABASE_URL
 *
 * The script is resumable: images whose URLs already start with
 * NEXT_PUBLIC_CDN_URL are skipped automatically.
 */

import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// ─── Config ─────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const CDN_URL = (process.env.NEXT_PUBLIC_CDN_URL || "").replace(/\/$/, "");

const DEFAULT_CONCURRENCY = 5;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const concurrencyIdx = args.indexOf("--concurrency");
const CONCURRENCY =
  concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1]) : DEFAULT_CONCURRENCY;
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : undefined;

// ─── Clients ─────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImageJob {
  type: "card" | "variant";
  id: string;
  sourceUrl: string;
  r2Key: string;
}

interface MigrationResult {
  id: string;
  type: "card" | "variant";
  status: "migrated" | "skipped" | "already-on-cdn" | "error";
  newUrl?: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "NEXT_PUBLIC_CDN_URL"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\nMissing required env vars: ${missing.join(", ")}`);
    console.error("Copy .env.example and fill in your R2 credentials.\n");
    process.exit(1);
  }
}

/**
 * Derive a stable R2 key from a card ID or variant ID.
 * Cards:    "cards/OP01-001.webp"
 * Variants: "variants/OP01-001_p1.webp"
 */
function sourceUrlToR2Key(id: string, type: "card" | "variant"): string {
  const prefix = type === "card" ? "cards" : "variants";
  return `${prefix}/${id}.webp`;
}

function cdnUrl(r2Key: string): string {
  return `${CDN_URL}/${r2Key}`;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download an image URL and return the buffer.
 * Retries up to RETRY_ATTEMPTS times on transient failures.
 */
async function downloadImage(url: string, attempt = 1): Promise<Buffer> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "OPTCG-Simulator/1.0 (image-migration)",
        Accept: "image/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch (err) {
    if (attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return downloadImage(url, attempt + 1);
    }
    throw err;
  }
}

/**
 * Check if a key already exists in R2 (for resumability without DB check).
 */
async function existsInR2(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload a buffer to R2 and return the CDN URL.
 */
async function uploadToR2(key: string, data: Buffer): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: data,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return cdnUrl(key);
}

/**
 * Process a single image job: download → upload → DB update.
 */
async function processJob(job: ImageJob): Promise<MigrationResult> {
  // Already on CDN
  if (job.sourceUrl.startsWith(CDN_URL)) {
    return { id: job.id, type: job.type, status: "already-on-cdn" };
  }

  if (DRY_RUN) {
    return {
      id: job.id,
      type: job.type,
      status: "skipped",
      newUrl: cdnUrl(job.r2Key),
    };
  }

  try {
    // Check if already uploaded to R2 (resumability)
    const alreadyUploaded = await existsInR2(job.r2Key);
    const newUrl = cdnUrl(job.r2Key);

    if (!alreadyUploaded) {
      const imageData = await downloadImage(job.sourceUrl);
      await uploadToR2(job.r2Key, imageData);
    }

    // Update DB
    if (job.type === "card") {
      await prisma.card.update({
        where: { id: job.id },
        data: { imageUrl: newUrl },
      });
    } else {
      await prisma.artVariant.update({
        where: { id: job.id },
        data: { imageUrl: newUrl },
      });
    }

    return { id: job.id, type: job.type, status: "migrated", newUrl };
  } catch (err) {
    return {
      id: job.id,
      type: job.type,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run jobs with bounded concurrency.
 */
async function runConcurrent(
  jobs: ImageJob[],
  concurrency: number,
  onResult: (result: MigrationResult, index: number, total: number) => void
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];
  let index = 0;

  async function worker() {
    while (index < jobs.length) {
      const jobIndex = index++;
      const result = await processJob(jobs[jobIndex]);
      results.push(result);
      onResult(result, jobIndex + 1, jobs.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   OPTCG Image Migration → Cloudflare R2  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Bucket:      ${R2_BUCKET_NAME}`);
  console.log(`  CDN URL:     ${CDN_URL}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Dry run:     ${DRY_RUN}`);
  if (LIMIT) console.log(`  Limit:       ${LIMIT}`);
  console.log();

  validateEnv();

  // ── Fetch all image URLs from DB ──────────────────────────────────────────
  console.log("━━━ Fetching image URLs from database ━━━");

  const [cards, variants] = await Promise.all([
    prisma.card.findMany({ select: { id: true, imageUrl: true } }),
    prisma.artVariant.findMany({ select: { id: true, imageUrl: true } }),
  ]);

  console.log(`  Cards:    ${cards.length}`);
  console.log(`  Variants: ${variants.length}`);
  console.log(`  Total:    ${cards.length + variants.length}`);
  console.log();

  // ── Build job list ────────────────────────────────────────────────────────
  const jobs: ImageJob[] = [
    ...cards.map((c) => ({
      type: "card" as const,
      id: c.id,
      sourceUrl: c.imageUrl,
      r2Key: sourceUrlToR2Key(c.id, "card"),
    })),
    ...variants.map((v) => ({
      type: "variant" as const,
      id: v.id,
      sourceUrl: v.imageUrl,
      r2Key: sourceUrlToR2Key(v.id, "variant"),
    })),
  ];

  // Filter out already-migrated (fast path without R2 head check)
  const pending = jobs.filter((j) => !j.sourceUrl.startsWith(CDN_URL));
  const alreadyMigrated = jobs.length - pending.length;

  const limited = LIMIT ? pending.slice(0, LIMIT) : pending;

  console.log(`  Already on CDN: ${alreadyMigrated}`);
  console.log(`  To migrate:     ${pending.length}`);
  if (LIMIT && LIMIT < pending.length) {
    console.log(`  (limited to ${LIMIT} for this run)`);
  }
  console.log();

  if (limited.length === 0) {
    console.log("✅ All images are already on the CDN. Nothing to do.");
    return;
  }

  // ── Run migration ─────────────────────────────────────────────────────────
  console.log(`━━━ ${DRY_RUN ? "Dry run" : "Migrating"} ${limited.length} images ━━━`);
  console.log();

  const counters = { migrated: 0, skipped: 0, alreadyOnCdn: 0, errors: 0 };
  const errors: MigrationResult[] = [];

  const results = await runConcurrent(limited, CONCURRENCY, (result, done, total) => {
    const pct = Math.round((done / total) * 100);
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));

    if (result.status === "migrated") counters.migrated++;
    else if (result.status === "skipped") counters.skipped++;
    else if (result.status === "already-on-cdn") counters.alreadyOnCdn++;
    else {
      counters.errors++;
      errors.push(result);
    }

    process.stdout.write(
      `\r  [${bar}] ${pct}% — ${done}/${total} — ✓ ${counters.migrated} ✕ ${counters.errors}`
    );
  });

  console.log("\n");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("━━━ Results ━━━");
  console.log();
  if (DRY_RUN) {
    console.log(`  Would migrate: ${results.length} images`);
    console.log(`  Sample CDN URL: ${results[0]?.newUrl || "(none)"}`);
  } else {
    console.log(`  ✅ Migrated:    ${counters.migrated}`);
    if (counters.errors > 0) {
      console.log(`  ✕  Errors:      ${counters.errors}`);
    }
  }

  if (errors.length > 0) {
    console.log("\n━━━ Errors ━━━");
    for (const e of errors.slice(0, 20)) {
      console.log(`  [${e.type}] ${e.id}: ${e.error}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more`);
    }
  }

  console.log();
  if (!DRY_RUN && counters.migrated > 0) {
    console.log("Next step: verify a sample of URLs in your browser, then deploy.");
  }
}

main()
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
