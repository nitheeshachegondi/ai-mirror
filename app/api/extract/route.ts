import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|html?)$/i;

/** Turns an uploaded feature doc (PDF or text-like file) into plain text for the refine step. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 5 MB)." }, { status: 413 });

    const buf = new Uint8Array(await file.arrayBuffer());
    let text = "";

    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buf);
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } else if (TEXT_EXT.test(file.name) || file.type.startsWith("text/")) {
      text = new TextDecoder("utf-8").decode(buf);
      if (/\.html?$/i.test(file.name)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
    } else {
      return NextResponse.json({ error: "Upload a PDF, .txt, .md, .csv, .json or .html file." }, { status: 415 });
    }

    text = text.replace(/\s+/g, " ").trim();
    if (!text) return NextResponse.json({ error: "Couldn't find readable text in that file." }, { status: 422 });

    return NextResponse.json({ text: text.slice(0, 12000), chars: text.length, name: file.name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not read that file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
