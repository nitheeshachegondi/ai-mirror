import { NextResponse } from "next/server";
import { groqJSON, GroqError } from "@/lib/groq";
import { REFINE_SYSTEM } from "@/lib/prompts";
import { normalizeProfile, cleanProfile } from "@/lib/normalize";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { profile?: Profile; correction?: string; documentText?: string };
    const correction = String(body.correction ?? "").trim().slice(0, 4000);
    const documentText = String(body.documentText ?? "").trim().slice(0, 12000);

    if (!body.profile || typeof body.profile !== "object") {
      return NextResponse.json({ error: "Missing profile." }, { status: 400 });
    }
    if (!correction && !documentText) {
      return NextResponse.json({ error: "Type or speak a correction first (or upload a document)." }, { status: 400 });
    }

    const current = cleanProfile(body.profile);
    // Don't send internal bookkeeping fields to the model.
    const { sources: _s, updatedAt: _u, url: _url, ...forModel } = current;
    void _s;
    void _u;
    void _url;

    const userMsg = `CURRENT PROFILE:
${JSON.stringify(forModel, null, 2)}

FOUNDER'S CORRECTION (may be dictated by voice):
${correction || "(none — see document)"}
${documentText ? `\nUPLOADED DOCUMENT TEXT:\n${documentText}` : ""}`;

    const raw = (await groqJSON(REFINE_SYSTEM, userMsg)) as Record<string, unknown>;
    const profile = normalizeProfile(raw, {
      name: current.name,
      url: current.url,
      tagline: current.tagline,
      summary: current.summary,
      sources: current.sources,
      aiView: current.aiView,
    });
    const changes = Array.isArray(raw.changes) ? raw.changes.map((c) => String(c)).filter(Boolean).slice(0, 8) : [];

    return NextResponse.json({ profile, changes });
  } catch (e) {
    const status = e instanceof GroqError ? e.status : 400;
    const message = e instanceof Error ? e.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status });
  }
}
