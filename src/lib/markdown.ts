import DOMPurify from "dompurify";
import { marked } from "marked";

export function renderMarkdown(md: string, resolveAsset: (rel: string) => string): string {
  const raw = marked.parse(md, { async: false }) as string;
  const clean = DOMPurify.sanitize(raw);
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("assets/")) img.setAttribute("src", resolveAsset(src));
  });
  return doc.body.innerHTML;
}
