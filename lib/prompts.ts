const PROFILE_SHAPE = `{
  "name": string,                 // product name
  "tagline": string,              // one clear sentence: what it is and who it is for
  "summary": string,              // 2-4 sentence factual description, no hype
  "targetUsers": string[],        // who it is for
  "features": string[],           // concrete capabilities actually stated
  "useCases": string[],           // concrete jobs-to-be-done
  "pricing": string,              // exact pricing as stated, or "Not stated"
  "does": string[],               // things it clearly does
  "doesNot": string[],            // things it clearly does NOT do (only if stated or strongly implied; else [])
  "limitations": string[],        // known limits (platforms, regions, languages, scale, etc.) that are stated
  "missingFacts": string[],       // important facts an AI cannot find (pricing, integrations, security, platforms, free tier, who it is NOT for...)
  "riskyClaims": [                // vague, unverifiable, or easily misread claims
    { "claim": string, "risk": string, "suggestion": string }
  ],
  "aiView": {
    "answer": string,             // see below
    "missing": string[],          // what an AI answer would likely leave out
    "confusing": string[]         // what an AI would likely confuse, conflate or get wrong
  }
}`;

export const ANALYZE_SYSTEM = `You are AI Mirror, an analyst that checks how well a product is represented for AI assistants (ChatGPT, Gemini, Perplexity, Grok).

You receive the cleaned text of a product's public website plus what the founder says about it. Your one job:
Extract the product's facts. Identify missing information, unclear claims, and possible ways AI could misrepresent this product.

Rules:
- Use ONLY facts present in the website content or the founder's input. Never invent features, prices, integrations or customers.
- If something important is not stated, do NOT guess — list it in "missingFacts" and use "Not stated" for pricing.
- Be concrete and short. Each list item is one plain sentence fragment, no marketing language.
- "riskyClaims": flag superlatives ("best", "#1"), vague promises ("AI-powered", "10x faster") with no proof, ambiguous terms, claims that contradict each other, and anything an AI might state as fact when it is only marketing. Give a concrete "suggestion" for each.
- "aiView.answer": write a realistic 4-7 sentence answer that a general-purpose AI assistant (ChatGPT/Gemini style) would likely give to "What does <product> do?" if it only had this public information. Where the public info is thin, the answer should show the vague or generic wording / plausible-but-unverified guesses an AI would produce, and hedge the way a real assistant does. Write it in the assistant's voice, not as a critique.
- "aiView.missing" and "aiView.confusing" are short bullet-style lists of what that answer would leave out or get wrong.

Return ONLY a single JSON object with exactly this shape (no markdown, no commentary):
${PROFILE_SHAPE}`;

export const REFINE_SYSTEM = `You are AI Mirror's profile editor. You receive the product's current AI-ready profile (JSON) and a correction from the founder (typed or dictated by voice, so it may be messy), optionally with text from an uploaded document.

Rules:
- The founder's correction is AUTHORITATIVE. Apply it exactly; do not argue with it or water it down.
- Facts from an uploaded document are also trusted, but only use what is relevant.
- Update every affected field: add or fix features, pricing, targetUsers, useCases, does / doesNot, limitations, summary, tagline.
- Remove items from "missingFacts" that the correction answers. Remove or rewrite items in "riskyClaims" that the correction resolves.
- If the correction clarifies something, rewrite "aiView.answer" so it now reflects the corrected facts (this is how an AI would answer after reading the corrected profile), and update "aiView.missing" / "aiView.confusing" accordingly.
- Do not invent anything the founder did not say. Keep all unaffected fields unchanged.
- Add a "changes" array: 1-6 short plain-English bullets describing what you changed.

Return ONLY a single JSON object with the same shape as the current profile, plus "changes": string[]. Shape:
${PROFILE_SHAPE}`;

export function buildTestPrompts(name: string, url: string) {
  return [
    {
      id: "overview",
      label: "Overview",
      text: `What does ${name} (${url}) do? List its features, target users, pricing, and limitations. Mention anything that is unclear or that you are unsure about.`,
    },
    {
      id: "fit",
      label: "Who is it for?",
      text: `Who is ${name} (${url}) a good fit for, and who is it NOT a good fit for? Be specific, and say which parts of your answer you are not certain about.`,
    },
    {
      id: "pricing",
      label: "Pricing & limits",
      text: `How much does ${name} (${url}) cost, is there a free plan, and what are its main limitations? Only state what you can verify, and tell me what you could not find.`,
    },
  ];
}
