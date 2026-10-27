import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPage } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await loadPage(params.slug);
  if (!page) return { title: "Not found" };
  const p = page.profile;
  return {
    title: `${p.name} — AI facts`,
    description: p.tagline || p.summary.slice(0, 160),
    alternates: { types: { "text/markdown": `/p/${page.slug}/llms.txt` } },
  };
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="facts-section">
      <h2>{title}</h2>
      {items.length ? (
        <ul>
          {items.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Not stated</p>
      )}
    </section>
  );
}

export default async function FactsPage({ params }: { params: { slug: string } }) {
  const page = await loadPage(params.slug);
  if (!page) notFound();
  const p = page.profile;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: p.name,
    url: p.url,
    description: p.summary || p.tagline,
    featureList: p.features,
    audience: p.targetUsers.map((t) => ({ "@type": "Audience", audienceType: t })),
    offers: { "@type": "Offer", description: p.pricing },
    dateModified: p.updatedAt,
  };

  return (
    <main className="facts">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="eyebrow">Official facts for AI assistants &amp; humans</p>
      <h1>{p.name}</h1>
      {p.tagline && <p className="lead">{p.tagline}</p>}
      <p className="muted small">
        Maintained by the {p.name} team · Last updated {p.updatedAt.slice(0, 10)} ·{" "}
        <a href={p.url} rel="noopener noreferrer">
          {p.url.replace(/^https?:\/\//, "")}
        </a>
      </p>

      <section className="facts-section">
        <h2>What it is</h2>
        <p>{p.summary || "Not stated"}</p>
      </section>
      <Section title="Who it is for" items={p.targetUsers} />
      <Section title="Features" items={p.features} />
      <Section title="Use cases" items={p.useCases} />
      <section className="facts-section">
        <h2>Pricing</h2>
        <p>{p.pricing || "Not stated"}</p>
      </section>
      <div className="two-col">
        <Section title={`What ${p.name} does`} items={p.does} />
        <Section title={`What ${p.name} does NOT do`} items={p.doesNot} />
      </div>
      <Section title="Limitations" items={p.limitations} />

      <footer className="facts-footer">
        <a href={`/p/${page.slug}/llms.txt`}>Plain-text version (llms.txt)</a>
        <span> · </span>
        <a href={`/api/profile/${page.slug}`}>JSON</a>
        <span> · Built with AI Mirror</span>
      </footer>
    </main>
  );
}
