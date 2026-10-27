import type { Profile, RiskyClaim } from "./types";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : fallback;

const toList = (v: unknown): string[] => {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? JSON.stringify(x) : String(x ?? "")))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
};

const toRisks = (v: unknown): RiskyClaim[] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return { claim: x.trim(), risk: "", suggestion: "" };
      const o = (x ?? {}) as Record<string, unknown>;
      return { claim: toStr(o.claim), risk: toStr(o.risk), suggestion: toStr(o.suggestion) };
    })
    .filter((r) => r.claim);
};

/** Coerce whatever the model returned into a well-formed Profile. */
export function normalizeProfile(raw: unknown, base: Partial<Profile> = {}): Profile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const view = (o.aiView && typeof o.aiView === "object" ? o.aiView : {}) as Record<string, unknown>;
  const baseView = base.aiView;

  return {
    name: toStr(o.name) || base.name || "Untitled product",
    url: base.url || toStr(o.url),
    tagline: toStr(o.tagline) || base.tagline || "",
    summary: toStr(o.summary) || base.summary || "",
    targetUsers: toList(o.targetUsers),
    features: toList(o.features),
    useCases: toList(o.useCases),
    pricing: toStr(o.pricing) || "Not stated",
    does: toList(o.does),
    doesNot: toList(o.doesNot),
    limitations: toList(o.limitations),
    missingFacts: toList(o.missingFacts),
    riskyClaims: toRisks(o.riskyClaims),
    aiView: {
      answer: toStr(view.answer) || baseView?.answer || "",
      missing: toList(view.missing).length ? toList(view.missing) : baseView?.missing ?? [],
      confusing: toList(view.confusing).length ? toList(view.confusing) : baseView?.confusing ?? [],
    },
    sources: base.sources ?? toList(o.sources),
    updatedAt: new Date().toISOString(),
  };
}

/** Strip blank list items (the manual editor keeps blank lines while typing). */
export function cleanProfile(p: Profile): Profile {
  const keep = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  return {
    ...p,
    name: p.name.trim(),
    tagline: p.tagline.trim(),
    summary: p.summary.trim(),
    pricing: p.pricing.trim() || "Not stated",
    targetUsers: keep(p.targetUsers),
    features: keep(p.features),
    useCases: keep(p.useCases),
    does: keep(p.does),
    doesNot: keep(p.doesNot),
    limitations: keep(p.limitations),
    missingFacts: keep(p.missingFacts),
  };
}
