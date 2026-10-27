import type { Profile } from "./types";

const UNKNOWN_PRICING = /^(|not (stated|available|specified|listed|found|provided)|unknown|n\/a|tbd)\b/i;

/**
 * A simple, transparent "AI-readiness" score (0–100): how complete and unambiguous
 * the product facts are. Used to show before/after as the founder corrects the profile.
 */
export function computeScore(p: Profile): number {
  let s = 0;
  if (p.summary.trim().length >= 40) s += 15;
  s += Math.min(p.features.filter(Boolean).length, 3) * 5; // up to 15
  if (p.targetUsers.filter(Boolean).length >= 1) s += 10;
  if (p.useCases.filter(Boolean).length >= 1) s += 10;
  if (!UNKNOWN_PRICING.test(p.pricing.trim())) s += 15;
  if (p.does.filter(Boolean).length >= 2) s += 10;
  if (p.doesNot.filter(Boolean).length >= 1) s += 10;
  if (p.limitations.filter(Boolean).length >= 1) s += 5;
  const open = p.missingFacts.filter(Boolean).length + p.riskyClaims.length;
  s += 10 - Math.min(10, open);
  return Math.max(0, Math.min(100, s));
}
