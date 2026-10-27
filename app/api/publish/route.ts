import { NextResponse } from "next/server";
import { savePage, storageMode } from "@/lib/store";
import { cleanProfile } from "@/lib/normalize";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 80_000) return NextResponse.json({ error: "Profile is too large." }, { status: 413 });

    const body = JSON.parse(raw) as { profile?: Profile; slug?: string; token?: string };
    if (!body.profile || typeof body.profile !== "object" || !body.profile.name) {
      return NextResponse.json({ error: "Missing profile." }, { status: 400 });
    }

    const profile = cleanProfile({ ...body.profile, updatedAt: new Date().toISOString() });
    const result = await savePage(profile, { slug: body.slug, token: body.token });

    return NextResponse.json({
      slug: result.slug,
      token: result.token,
      created: result.created,
      path: `/p/${result.slug}`,
      storage: storageMode(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not publish.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
