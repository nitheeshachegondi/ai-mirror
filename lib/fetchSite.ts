import * as cheerio from "cheerio";
import { lookup } from "dns/promises";
import net from "net";
import type { PageInfo } from "./types";

const UA = "Mozilla/5.0 (compatible; AIMirrorBot/0.1; +https://aimirror.app)";
const PAGE_CHAR_CAP = 6000;
const TOTAL_CHAR_CAP = 18000;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;

const PAGE_HINTS: { key: string; re: RegExp; guesses: string[] }[] = [
  { key: "pricing", re: /pric|plans?|subscription|billing/i, guesses: ["/pricing"] },
  { key: "features", re: /features?|product|platform|solutions?|how-it-works|capabilit/i, guesses: ["/features"] },
  { key: "about", re: /about|company|story|mission/i, guesses: ["/about"] },
  { key: "faq", re: /faq|help|support|questions/i, guesses: ["/faq"] },
  { key: "docs", re: /docs?|documentation|guide|integrations?|security/i, guesses: [] },
];

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80")) return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
  }
  return false;
}

/** Throws unless the URL is plain http(s) pointing at a public host. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs are supported.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Please use a public website URL.");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Please use a public website URL.");
    return u;
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      throw new Error("Please use a public website URL.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Please use")) throw e;
    throw new Error(`Couldn't resolve ${host}. Check the URL and try again.`);
  }
  return u;
}

async function fetchHtml(startUrl: string): Promise<{ url: string; html: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(u.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        current = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get("content-type") || "";
      if (!/html|xml|text\/plain/i.test(type)) return null;
      const buf = await res.arrayBuffer();
      const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
      return { url: u.toString(), html };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function cleanText(html: string): { text: string; links: { href: string; label: string }[] } {
  const $ = cheerio.load(html);

  const links: { href: string; label: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push({ href, label: $(el).text().replace(/\s+/g, " ").trim() });
  });

  const parts: string[] = [];
  const title = $("title").first().text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content");
  if (title) parts.push(`TITLE: ${title}`);
  if (metaDesc) parts.push(`META DESCRIPTION: ${metaDesc.trim()}`);

  // JSON-LD often carries clean facts (pricing, app category)
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (raw && raw.length < 3000) parts.push(`STRUCTURED DATA: ${raw.replace(/\s+/g, " ")}`);
  });

  $("script, style, noscript, svg, iframe, form, header nav, footer nav, [aria-hidden='true']").remove();

  const seen = new Set<string>();
  $("h1, h2, h3, h4, p, li, th, td, summary, dt, dd, blockquote, figcaption").each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() || "p";
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 600 || seen.has(t)) return;
    seen.add(t);
    parts.push(/^h[1-4]$/.test(tag) ? `## ${t}` : tag === "li" ? `- ${t}` : t);
  });

  return { text: parts.join("\n"), links };
}

export interface SiteResult {
  content: string;
  pages: PageInfo[];
  warnings: string[];
}

export async function fetchSite(rawUrl: string): Promise<SiteResult> {
  const withProto = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const home = await fetchHtml(withProto);
  if (!home) {
    throw new Error("Couldn't read that website. Is it public and reachable? (Some sites block automated readers.)");
  }

  const base = new URL(home.url);
  const homeClean = cleanText(home.html);

  // Discover sub-pages from home-page links, then add a few common guesses.
  const candidates = new Map<string, string>();
  for (const { href, label } of homeClean.links) {
    try {
      const u = new URL(href, base);
      if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      if (/\.(png|jpe?g|gif|svg|pdf|zip|webp|ico|css|js)$/i.test(u.pathname)) continue;
      u.hash = "";
      u.search = "";
      if (u.pathname === "/" || u.pathname === base.pathname) continue;
      const hay = `${u.pathname} ${label}`;
      const hint = PAGE_HINTS.find((h) => h.re.test(hay));
      if (hint && !candidates.has(u.toString())) candidates.set(u.toString(), hint.key);
    } catch {
      /* ignore bad hrefs */
    }
  }
  const foundKeys = new Set(candidates.values());
  for (const h of PAGE_HINTS) {
    if (foundKeys.has(h.key)) continue;
    for (const g of h.guesses) candidates.set(new URL(g, base).toString(), h.key);
  }

  const urls = Array.from(candidates.keys()).slice(0, 7);
  const fetched = await Promise.all(urls.map((u) => fetchHtml(u)));

  const pages: PageInfo[] = [];
  const chunks: string[] = [];
  let total = 0;

  const add = (url: string, text: string) => {
    if (!text || total >= TOTAL_CHAR_CAP) return;
    const slice = text.slice(0, Math.min(PAGE_CHAR_CAP, TOTAL_CHAR_CAP - total));
    total += slice.length;
    pages.push({ url, chars: slice.length });
    chunks.push(`--- PAGE: ${url} ---\n${slice}`);
  };

  add(home.url, homeClean.text);
  const seenPaths = new Set([new URL(home.url).pathname]);
  for (const r of fetched) {
    if (!r) continue;
    const p = new URL(r.url).pathname;
    if (seenPaths.has(p)) continue;
    seenPaths.add(p);
    add(r.url, cleanText(r.html).text);
  }

  const warnings: string[] = [];
  if (homeClean.text.length < 400) {
    warnings.push(
      "The home page has very little readable text — it may be rendered with JavaScript. AI crawlers see the same thin page, which is itself a finding. Add facts by typing or uploading a doc below."
    );
  }
  if (pages.length === 1) {
    warnings.push("Only the home page could be read (no pricing, features, about or FAQ page found).");
  }

  return { content: chunks.join("\n\n"), pages, warnings };
}
