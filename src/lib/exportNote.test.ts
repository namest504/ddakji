import { describe, expect, it } from "vitest";
import { buildHtmlDoc, collectAssetRefs, embedAssets, exportBodyHtml } from "./exportNote";

describe("exportNote (#149)", () => {
  it("JSON에서 원본 상대경로 그대로 HTML을 만든다 — asset URL 변환 없음", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "본문" }] },
        { type: "image", attrs: { src: "assets/n1/a.png", width: 120 } },
      ],
    };
    const html = exportBodyHtml(doc);
    expect(html).toContain('src="assets/n1/a.png"');
    expect(html).not.toContain("asset.localhost");
    expect(html).toContain('width="120"');
  });

  it("에셋 수집은 중복을 걷고 이 노트 것만 본다", () => {
    const html =
      '<img src="assets/n1/a.png"><img src="assets/n1/a.png"><img src="assets/n2/b.png">';
    expect(collectAssetRefs(html, "n1")).toEqual(["assets/n1/a.png"]);
  });

  it("data URI 치환으로 자급자족이 된다", () => {
    const html = '<img src="assets/n1/a.png">';
    const out = embedAssets(html, new Map([["assets/n1/a.png", "data:image/png;base64,AAA"]]));
    expect(out).toBe('<img src="data:image/png;base64,AAA">');
  });

  it("HTML 문서는 제목을 이스케이프하고 다크를 존중한다", () => {
    const doc = buildHtmlDoc("<제목> & Co", "ko", "<p>x</p>");
    expect(doc).toContain("&lt;제목&gt; &amp; Co");
    expect(doc).toContain("color-scheme: light dark");
    expect(doc).toContain("ddakji로 작성됨");
  });
});
