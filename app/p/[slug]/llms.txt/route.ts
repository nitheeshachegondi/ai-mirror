import { loadPage } from "@/lib/store";
import { profileToMarkdown } from "@/lib/factsText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const page = await loadPage(params.slug);
  if (!page) return new Response("Not found", { status: 404 });
  const origin = new URL(req.url).origin;
  return new Response(profileToMarkdown(page.profile, `${origin}/p/${page.slug}`), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
