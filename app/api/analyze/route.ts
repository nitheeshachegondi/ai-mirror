import { NextResponse } from "next/server";
import { fetchSite } from "@/lib/fetchSite";
import { groqJSON, GroqError } from "@/lib/groq";
import { ANALYZE_SYSTEM } from "@/lib/prompts";
import { normalizeProfile } from "@/lib/normalize";
import { computeScore } from "@/lib/score";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const url = String(body.url ?? "").trim();
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim().slice(0, 500);
    const targetUser = String(body.targetUser ?? "").trim().slice(0, 300);

    if (!url) return NextResponse.json({ error: "Please enter your product URL." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Please enter your product name." }, { status: 400 });

    const site = await fetchSite(url);

    const userMsg = `PRODUCT NAME: ${name}
WEBSITE: ${url}
FOUNDER'S ONE-LINE DESCRIPTION: ${description || "(not provided)"}
FOUNDER'S TARGET USER: ${targetUser || "(not provided)"}

=== PUBLIC WEBSITE CONTENT (cleaned) ===
${site.content}`;

    const raw = await groqJSON(ANALYZE_SYSTEM, userMsg);
    const profile = normalizeProfile(raw, {
      name,
      url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
      sources: site.pages.map((p) => p.url),
    });

    // If the founder gave us a one-liner and the model left the tagline blank, keep theirs.
    if (!profile.tagline && description) profile.tagline = description;
    if (!profile.targetUsers.length && targetUser) profile.targetUsers = [targetUser];

    return NextResponse.json({
      profile,
      pages: site.pages,
      warnings: site.warnings,
      baselineScore: computeScore(profile),
    });
  } catch (e) {
    const status = e instanceof GroqError ? e.status : 400;
    const message = e instanceof Error ? e.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status });
  }
}
