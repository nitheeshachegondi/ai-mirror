"use client";

import { useEffect, useRef, useState } from "react";
import type { PageInfo, Profile } from "@/lib/types";
import { computeScore } from "@/lib/score";
import { cleanProfile } from "@/lib/normalize";
import { buildTestPrompts } from "@/lib/prompts";

type Stage = "input" | "loading" | "review";

interface Published {
  slug: string;
  token: string;
  storage?: "redis" | "file";
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

function Bullets({ items, empty = "None found" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="muted small">{empty}</p>;
  return (
    <ul>
      {items.map((i, idx) => (
        <li key={idx}>{i}</li>
      ))}
    </ul>
  );
}

function Chips({ items, tone }: { items: string[]; tone?: "ok" | "no" }) {
  if (!items.length) return <p className="muted small">Not stated</p>;
  return (
    <div className="chips">
      {items.map((i, idx) => (
        <span key={idx} className={`chip ${tone ?? ""}`}>
          {i}
        </span>
      ))}
    </div>
  );
}

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="field">
      <label>{label} (one per line)</label>
      <textarea rows={Math.max(3, items.length + 1)} value={items.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
    </div>
  );
}

export default function Mirror() {
  const [stage, setStage] = useState<Stage>("input");
  const [form, setForm] = useState({ url: "", name: "", description: "", targetUser: "" });
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [baseline, setBaseline] = useState(0);

  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState("");
  const [docText, setDocText] = useState("");
  const [docName, setDocName] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "refine" | "publish" | "upload">("");
  const [listening, setListening] = useState(false);

  const [published, setPublished] = useState<Published | null>(null);
  const [origin, setOrigin] = useState("");
  const [promptId, setPromptId] = useState("overview");
  const [copied, setCopied] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const score = profile ? computeScore(profile) : 0;
  const pageUrl = published ? `${origin}/p/${published.slug}` : "";

  const upd = (patch: Partial<Profile>) => setProfile((p) => (p ? { ...p, ...patch } : p));

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStage("loading");
    try {
      const data = await postJSON<{ profile: Profile; pages: PageInfo[]; warnings: string[]; baselineScore: number }>(
        "/api/analyze",
        form
      );
      setProfile(data.profile);
      setPages(data.pages);
      setWarnings(data.warnings);
      setBaseline(data.baselineScore);
      setChanges([]);
      setPublished(null);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("input");
    }
  }

  async function applyCorrection() {
    if (!profile) return;
    setError("");
    setBusy("refine");
    try {
      const data = await postJSON<{ profile: Profile; changes: string[] }>("/api/refine", {
        profile: cleanProfile(profile),
        correction,
        documentText: docText,
      });
      setProfile(data.profile);
      setChanges(data.changes);
      setCorrection("");
      setDocText("");
      setDocName("");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  async function uploadDoc(file: File) {
    setError("");
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDocText(data.text);
      setDocName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publish() {
    if (!profile) return;
    setError("");
    setBusy("publish");
    try {
      const clean = cleanProfile(profile);
      const data = await postJSON<Published & { created: boolean }>("/api/publish", {
        profile: clean,
        slug: published?.slug,
        token: published?.token,
      });
      setProfile(clean);
      setPublished({ slug: data.slug, token: data.token, storage: data.storage });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setBusy("");
    }
  }

  function toggleVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setError("This browser has no built-in speech recognition. Use Wispr Flow (or your OS dictation) in the text box instead — it works in any field.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-IN";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (ev: any) => {
      let t = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) t += ev.results[i][0].transcript + " ";
      }
      if (t.trim()) setCorrection((c) => (c ? c.trimEnd() + " " : "") + t.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Couldn't copy automatically — select the text and copy it manually.");
    }
  }

  function reset() {
    setStage("input");
    setProfile(null);
    setPublished(null);
    setChanges([]);
    setError("");
    setCorrection("");
    setDocText("");
    setDocName("");
  }

  /* ───────────────────────── INPUT ───────────────────────── */
  if (stage === "input" || stage === "loading") {
    return (
      <>
        <section className="hero">
          <div className="logo">
            AI<span>Mirror</span>
          </div>
          <h1>Know how AI sees your product. Fix it before your customers see it wrong.</h1>
          <p className="sub">
            Paste your product URL. We read your public site, show how ChatGPT-style assistants would describe you, flag what is
            missing or risky, and publish a clean facts page AI can read.
          </p>
        </section>

        {stage === "loading" ? (
          <div className="loading card form">
            <div className="spinner" />
            <h2>Reading your site and holding up the mirror…</h2>
            <p className="muted">Fetching your pages, extracting facts, checking what AI might get wrong. About 10–20 seconds.</p>
          </div>
        ) : (
          <form className="card form" onSubmit={analyze}>
            <div className="field">
              <label htmlFor="url">Product URL</label>
              <input id="url" type="text" required placeholder="https://yourproduct.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="name">Product name</label>
                <input id="name" type="text" required placeholder="Acme" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="target">Target user</label>
                <input id="target" type="text" placeholder="Freshers preparing for interviews" value={form.targetUser} onChange={(e) => setForm({ ...form, targetUser: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="desc">One-line description</label>
              <input id="desc" type="text" placeholder="An AI interview coach that…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {error && <div className="alert err">{error}</div>}
            <button className="btn primary" type="submit" style={{ width: "100%" }}>
              Show me the AI Mirror →
            </button>
          </form>
        )}
      </>
    );
  }

  /* ───────────────────────── REVIEW ───────────────────────── */
  if (!profile) return null;
  const prompts = buildTestPrompts(profile.name, profile.url);
  const activePrompt = prompts.find((p) => p.id === promptId) ?? prompts[0];
  const enc = encodeURIComponent(activePrompt.text);
  const platforms = [
    { name: "ChatGPT", href: `https://chatgpt.com/?q=${enc}` },
    { name: "Gemini", href: "https://gemini.google.com/app" },
    { name: "Perplexity", href: `https://www.perplexity.ai/search?q=${enc}` },
    { name: "Grok", href: `https://grok.com/?q=${enc}` },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="muted small">AI Mirror · {profile.url.replace(/^https?:\/\//, "")}</div>
          <h1>{profile.name}</h1>
        </div>
        <div className="row">
          <span className={`pill ${score > baseline ? "up" : ""}`} title="How complete and unambiguous your facts are">
            AI-readiness: {baseline}
            {score !== baseline ? ` → ${score}` : ""} / 100
          </span>
          <button className="btn sm" onClick={reset}>
            Start over
          </button>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}
      {warnings.map((w, i) => (
        <div className="alert warn" key={i}>
          {w}
        </div>
      ))}
      <p className="muted small">Read {pages.length} page{pages.length === 1 ? "" : "s"}: {pages.map((p) => p.url.replace(/^https?:\/\//, "")).join(" · ")}</p>

      <div className="mirror" style={{ marginTop: 14 }}>
        {/* VIEW 1 */}
        <div className="card">
          <span className="tag now">View 1 · How AI may see it now</span>
          <div className="quote">{profile.aiView.answer || "No simulated answer available."}</div>

          <div className="block">
            <h3>Likely left out</h3>
            <Bullets items={profile.aiView.missing} />
          </div>
          <div className="block">
            <h3>Likely confused</h3>
            <Bullets items={profile.aiView.confusing} />
          </div>
          <div className="block">
            <h3>Missing facts (click to answer)</h3>
            {profile.missingFacts.length ? (
              <div className="chips">
                {profile.missingFacts.map((f, i) => (
                  <button key={i} className="chip ask" onClick={() => setCorrection((c) => (c ? c + "\n" : "") + `${f}: `)}>
                    {f}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">Nothing important flagged as missing.</p>
            )}
          </div>
          <div className="block">
            <h3>Risky or vague claims</h3>
            {profile.riskyClaims.length ? (
              profile.riskyClaims.map((r, i) => (
                <div className="risk" key={i}>
                  <b>“{r.claim}”</b>
                  {r.risk && <div>{r.risk}</div>}
                  {r.suggestion && <div className="fix">Fix: {r.suggestion}</div>}
                </div>
              ))
            ) : (
              <p className="muted small">No risky claims flagged.</p>
            )}
          </div>
        </div>

        {/* VIEW 2 */}
        <div className="card">
          <div className="row between">
            <span className="tag fixed">View 2 · Corrected AI profile</span>
            <button className="btn sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Done editing" : "Edit manually"}
            </button>
          </div>

          {editing ? (
            <>
              <div className="field">
                <label>Founder-approved description</label>
                <textarea rows={4} value={profile.summary} onChange={(e) => upd({ summary: e.target.value })} />
              </div>
              <div className="field">
                <label>One-line tagline</label>
                <input type="text" value={profile.tagline} onChange={(e) => upd({ tagline: e.target.value })} />
              </div>
              <div className="field">
                <label>Pricing</label>
                <input type="text" value={profile.pricing} onChange={(e) => upd({ pricing: e.target.value })} />
              </div>
              <ListEditor label="Target users" items={profile.targetUsers} onChange={(v) => upd({ targetUsers: v })} />
              <ListEditor label="Features" items={profile.features} onChange={(v) => upd({ features: v })} />
              <ListEditor label="Use cases" items={profile.useCases} onChange={(v) => upd({ useCases: v })} />
              <ListEditor label="Does" items={profile.does} onChange={(v) => upd({ does: v })} />
              <ListEditor label="Does NOT do" items={profile.doesNot} onChange={(v) => upd({ doesNot: v })} />
              <ListEditor label="Limitations" items={profile.limitations} onChange={(v) => upd({ limitations: v })} />
            </>
          ) : (
            <>
              {profile.tagline && <p style={{ fontWeight: 600, marginTop: 6 }}>{profile.tagline}</p>}
              <p>{profile.summary || <span className="muted">No description yet.</span>}</p>
              <div className="block">
                <h3>Who it is for</h3>
                <Chips items={profile.targetUsers} />
              </div>
              <div className="block">
                <h3>Features</h3>
                <Bullets items={profile.features} empty="Not stated" />
              </div>
              <div className="block">
                <h3>Use cases</h3>
                <Bullets items={profile.useCases} empty="Not stated" />
              </div>
              <div className="block">
                <h3>Pricing</h3>
                <p className="pricing">{profile.pricing}</p>
              </div>
              <div className="block">
                <h3>Does</h3>
                <Chips items={profile.does} tone="ok" />
              </div>
              <div className="block">
                <h3>Does not</h3>
                <Chips items={profile.doesNot} tone="no" />
              </div>
              <div className="block">
                <h3>Limitations</h3>
                <Bullets items={profile.limitations} empty="Not stated" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* CORRECT IT */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Correct it — by voice or text</h2>
        <p className="hint">
          Tell AI Mirror what is wrong or missing. Dictate with <b>Wispr Flow</b> straight into the box, use the mic button, or upload a feature doc / PDF.
          Every correction updates the profile.
        </p>
        <textarea
          rows={4}
          placeholder={`e.g. "Pricing is free for students, ₹499/month for Pro. We do NOT offer a mobile app yet. It also works for career switchers, not just freshers."`}
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy !== "" || (!correction.trim() && !docText)} onClick={applyCorrection}>
            {busy === "refine" ? "Updating profile…" : "Apply correction"}
          </button>
          <button className={`btn ${listening ? "rec" : ""}`} onClick={toggleVoice} type="button">
            {listening ? "● Stop recording" : "🎙 Speak"}
          </button>
          <button className="btn" type="button" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? "Reading file…" : "Upload doc / PDF"}
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".pdf,.txt,.md,.csv,.json,.html,.htm"
            onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])}
          />
          {docName && (
            <span className="doc-tag">
              {docName}
              <button
                aria-label="Remove document"
                onClick={() => {
                  setDocText("");
                  setDocName("");
                }}
              >
                ×
              </button>
            </span>
          )}
        </div>
        {changes.length > 0 && (
          <div className="changes">
            <b>Updated:</b>
            <ul>
              {changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* PUBLISH */}
      <div className="card">
        <h2>Publish your public AI facts page</h2>
        <p className="hint">A clean, crawlable page with structured data (JSON-LD) plus a plain-text llms.txt version — one source of truth for AI.</p>
        <button className="btn primary" disabled={busy !== ""} onClick={publish}>
          {busy === "publish" ? "Publishing…" : published ? "Update published page" : "Generate public page"}
        </button>

        {published && (
          <div className="published">
            <p>
              <b>Live:</b> <code>{pageUrl}</code>
            </p>
            <div className="row">
              <a className="btn sm" href={`/p/${published.slug}`} target="_blank" rel="noreferrer">
                Open page
              </a>
              <a className="btn sm" href={`/p/${published.slug}/llms.txt`} target="_blank" rel="noreferrer">
                llms.txt
              </a>
              <a className="btn sm" href={`/api/profile/${published.slug}`} target="_blank" rel="noreferrer">
                JSON
              </a>
              <button className="btn sm" onClick={() => copy(pageUrl, "url")}>
                {copied === "url" ? "Copied ✓" : "Copy link"}
              </button>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Link it from your own site (e.g. as <b>/ai-info</b> or in your footer) and add this to your {"<head>"} so crawlers discover it:
            </p>
            <pre className="snippet">{`<link rel="alternate" type="text/markdown" href="${pageUrl}/llms.txt" />`}</pre>
            {published.storage === "file" && (
              <p className="small" style={{ color: "var(--warn)", marginTop: 8 }}>
                Heads up: this server is using local-disk storage. On Vercel, add the Upstash Redis variables from .env.example so published pages persist.
              </p>
            )}
          </div>
        )}
      </div>

      {/* TEST PROMPTS */}
      <div className="card">
        <h2>Test what AI says — before and after</h2>
        <p className="hint">Run the same prompt on each assistant. Save the “before” answers now and compare after AI re-crawls your facts page.</p>
        <div className="tabs">
          {prompts.map((p) => (
            <button key={p.id} className={`tab ${p.id === activePrompt.id ? "active" : ""}`} onClick={() => setPromptId(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="prompt-box">{activePrompt.text}</div>
        <div className="row">
          {platforms.map((pl) => (
            <button
              key={pl.name}
              className="btn"
              onClick={() => {
                copy(activePrompt.text, pl.name);
                window.open(pl.href, "_blank", "noopener,noreferrer");
              }}
            >
              {copied === pl.name ? "Prompt copied ✓" : `Test on ${pl.name}`}
            </button>
          ))}
          <button className="btn" onClick={() => copy(activePrompt.text, "prompt")}>
            {copied === "prompt" ? "Copied ✓" : "Copy prompt only"}
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Each button copies the prompt and opens the assistant. Gemini doesn’t accept pre-filled prompts, so just paste it there.
        </p>
      </div>
    </>
  );
}
