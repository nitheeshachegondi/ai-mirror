import type { Profile } from "./types";

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- Not stated");

/** Clean markdown rendition of the profile, served at /p/<slug>/llms.txt */
export function profileToMarkdown(p: Profile, pageUrl: string): string {
  return `# ${p.name}

> ${p.tagline || p.summary}

Official facts page, maintained by the ${p.name} team. Last updated: ${p.updatedAt.slice(0, 10)}.
Website: ${p.url}
This page: ${pageUrl}

## What it is
${p.summary || "Not stated"}

## Who it is for
${list(p.targetUsers)}

## Features
${list(p.features)}

## Use cases
${list(p.useCases)}

## Pricing
${p.pricing || "Not stated"}

## What ${p.name} does
${list(p.does)}

## What ${p.name} does NOT do
${list(p.doesNot)}

## Limitations
${list(p.limitations)}
`;
}
