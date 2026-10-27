const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const env = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

export class GroqError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

async function callGroq(system: string, user: string): Promise<string> {
  const key = env?.GROQ_API_KEY;
  if (!key) throw new GroqError("GROQ_API_KEY is not set. Add it to .env.local (see .env.example).", 500);

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env?.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.2,
      max_tokens: 6000,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new GroqError("Groq rate limit hit — wait a few seconds and try again.", 429);
    throw new GroqError(`Groq API error (${res.status}): ${text.slice(0, 300)}`, 502);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GroqError("Groq returned an empty response.", 502);
  return content;
}

/** Ask Groq for a JSON object. Retries once if the output isn't valid JSON. */
export async function groqJSON(system: string, user: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await callGroq(system, user);
    try {
      return JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          /* fall through to retry */
        }
      }
    }
  }
  throw new GroqError("The model returned malformed JSON twice. Please try again.", 502);
}