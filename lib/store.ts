import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Profile } from "./types";

export interface StoredPage {
  slug: string;
  token: string; // edit token, never exposed publicly
  profile: Profile;
  createdAt: string;
  updatedAt: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;
export const isValidSlug = (s: string) => SLUG_RE.test(s);

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const FILE_DIR =
  process.env.AI_MIRROR_DATA_DIR || (process.env.VERCEL ? "/tmp/ai-mirror" : path.join(process.cwd(), ".data"));

export const storageMode = (): "redis" | "file" => (REDIS_URL && REDIS_TOKEN ? "redis" : "file");

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Storage error (${res.status})`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function loadPage(slug: string): Promise<StoredPage | null> {
  if (!isValidSlug(slug)) return null;
  try {
    if (storageMode() === "redis") {
      const raw = await redis(["GET", `aimirror:${slug}`]);
      return typeof raw === "string" ? (JSON.parse(raw) as StoredPage) : null;
    }
    const raw = await fs.readFile(path.join(FILE_DIR, `${slug}.json`), "utf8");
    return JSON.parse(raw) as StoredPage;
  } catch {
    return null;
  }
}

async function writePage(page: StoredPage): Promise<void> {
  const body = JSON.stringify(page);
  if (storageMode() === "redis") {
    await redis(["SET", `aimirror:${page.slug}`, body]);
    return;
  }
  await fs.mkdir(FILE_DIR, { recursive: true });
  await fs.writeFile(path.join(FILE_DIR, `${page.slug}.json`), body, "utf8");
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "product";
}

/** Create a new page, or update an existing one when slug + token match. */
export async function savePage(
  profile: Profile,
  opts: { slug?: string; token?: string }
): Promise<{ slug: string; token: string; created: boolean }> {
  const now = new Date().toISOString();

  if (opts.slug) {
    const existing = await loadPage(opts.slug);
    if (existing && existing.token === opts.token) {
      await writePage({ ...existing, profile, updatedAt: now });
      return { slug: existing.slug, token: existing.token, created: false };
    }
    // Wrong/missing token or unknown slug: fall through and mint a fresh page.
  }

  const slug = `${slugify(profile.name)}-${randomBytes(2).toString("hex")}`;
  const token = randomBytes(16).toString("hex");
  await writePage({ slug, token, profile, createdAt: now, updatedAt: now });
  return { slug, token, created: true };
}

/** Public, token-free view of a stored page. */
export function toPublic(page: StoredPage) {
  return { slug: page.slug, profile: page.profile, createdAt: page.createdAt, updatedAt: page.updatedAt };
}
