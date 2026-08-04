import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

const id = (rel: string) => `app://root/${rel}`;

describe("renderMarkdown", () => {
  it("renders headings and bold", () => {
    const html = renderMarkdown("# 제목\n\n**굵게**", id);
    expect(html).toContain("<h1>제목</h1>");
    expect(html).toContain("<strong>굵게</strong>");
  });

  it("strips script tags", () => {
    const html = renderMarkdown("hello <script>alert(1)</script>", id);
    expect(html).not.toContain("<script>");
  });

  it("rewrites relative asset image srcs", () => {
    const html = renderMarkdown("![img](assets/n1/a.png)", id);
    expect(html).toContain('src="app://root/assets/n1/a.png"');
  });

  it("leaves absolute urls alone", () => {
    const html = renderMarkdown("![img](https://x.com/a.png)", id);
    expect(html).toContain('src="https://x.com/a.png"');
  });

  // XSS regression guards
  it("removes onerror attributes from images", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">', id);
    expect(html).not.toContain("onerror");
  });

  it("prevents javascript: protocol in links", () => {
    const html = renderMarkdown("[click](javascript:alert(1))", id);
    expect(html).not.toContain("javascript:");
  });

  it("removes onload attributes from SVG", () => {
    const html = renderMarkdown('<svg onload=alert(1)>', id);
    expect(html).not.toContain("onload");
  });
});
