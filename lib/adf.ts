/** Minimal Atlassian Document Format helpers — no server-only imports, safe for client components. */

interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

/** Wraps plain text (blank-line-separated blocks become paragraphs) as a minimal ADF doc. */
export function textToAdf(text: string): AdfDoc {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return {
    type: "doc",
    version: 1,
    content:
      paragraphs.length > 0
        ? paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }))
        : [{ type: "paragraph", content: [] }],
  };
}

/** Extracts a plain-text approximation of an ADF doc — good enough to populate an edit textarea. Lossy: formatting, links, and mentions collapse to their visible text. */
export function adfToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as AdfNode;

  function walk(n: AdfNode): string {
    if (n.type === "text") return n.text ?? "";
    if (!n.content) return "";
    const inner = n.content.map(walk).join("");
    return n.type === "paragraph" || n.type === "heading" ? `${inner}\n\n` : inner;
  }

  return walk(node).trim();
}
