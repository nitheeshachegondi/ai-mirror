# AI Mirror

**Know how AI sees your product. Fix it before your customers see it wrong.**

Paste a product URL → AI Mirror reads the public site, shows how a ChatGPT/Gemini-style assistant would likely describe it, flags missing / vague / risky info, builds a clean AI-ready profile, lets the founder correct it by voice or text, publishes a public AI facts page, and gives copy-paste prompts to test ChatGPT, Gemini, Perplexity and Grok.

Stack: **Next.js 14 (App Router) + TypeScript + Groq + Vercel**.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your GROQ_API_KEY
npm run dev                  # http://localhost:3000
```

Get a Groq key at https://console.groq.com/keys. The default model is `llama-3.3-70b-versatile` (override with `GROQ_MODEL`).

## How it maps to the build steps

| Step | Where |
|---|---|
| 1. Input (URL, name, one-liner, target user) | `components/Mirror.tsx` (input stage) |
| 2. Fetch + clean website content (home, pricing, features, about, FAQ) | `lib/fetchSite.ts` |
| 3. Groq analysis → facts, missing info, risky claims | `app/api/analyze/route.ts`, `lib/prompts.ts` |
| 4. "AI Mirror" two views (now vs corrected) | `components/Mirror.tsx` (review stage) |
| 5. Correct by typing / voice / upload | `app/api/refine/route.ts`, `app/api/extract/route.ts` |
| 6. Public AI facts page (+ JSON-LD, `llms.txt`, JSON) | `app/p/[slug]/…`, `app/api/publish`, `app/api/profile/[slug]` |
| 7. Test prompts for ChatGPT / Gemini / Perplexity / Grok | `lib/prompts.ts` (`buildTestPrompts`), review stage |
| 8. Weekly tracking (roadmap) | not in MVP — see below |

### Voice input (Wispr Flow)
The correction box is a plain `<textarea>`, so **Wispr Flow dictation works in it out of the box** — hold your Wispr hotkey and talk. There is also a built-in 🎙 Speak button using the browser's Web Speech API (Chrome/Edge/Safari) as a fallback.

### Public page
After publishing you get `/p/<slug>` (human + crawler friendly, with `SoftwareApplication` JSON-LD), `/p/<slug>/llms.txt` (clean markdown) and `/api/profile/<slug>` (JSON). Link `/p/<slug>` from your own site (e.g. `/ai-info`) and add the `<link rel="alternate">` snippet shown in the app.

Updating a page re-uses the same slug via a private edit token held in the browser session.

## Deploy to Vercel

1. Push this folder to GitHub and import it in Vercel.
2. Set env vars: `GROQ_API_KEY` and — **important** — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
   (free Upstash Redis, or the Vercel Marketplace Upstash/KV integration which sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`; both are supported).
3. Deploy.

Without Redis, published pages are written to local disk (`.data/`) — fine for local dev, but Vercel's filesystem is ephemeral, so pages would disappear.

## Security notes
- The site fetcher blocks private / loopback / link-local IPs and re-checks every redirect hop (SSRF protection).
- Pages are only editable with the random edit token returned at first publish.
- No auth or rate limiting in the MVP — add both (e.g. Upstash Ratelimit) before opening it to the public.

## Roadmap (Step 8: tracking)
- Accounts + saved products
- Store the "before" AI answers; re-run the test prompts weekly through the model APIs
- Diff answers over time, score accuracy against the founder-approved facts, email a weekly report
- Custom-domain hosting of the facts page (`yourproduct.com/ai-info`)
