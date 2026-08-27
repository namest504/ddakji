import { generateHTML, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { ResizableImage, TaskItemSafe } from "../note/extensions";
import { translate, type Lang } from "./i18n";

/**
 * 내보내기용 HTML (#149). 에디터의 getHTML()은 이미지 src를 asset URL로
 * 변환해 내놓지만, getJSON()에는 원본 상대경로가 남아 있다 — 그래서 JSON에서
 * 변환 없는 확장으로 새로 렌더한다. 공유물에 이 기계의 경로가 섞이지 않는다.
 */
export function exportBodyHtml(doc: JSONContent): string {
  return generateHTML(doc, [
    StarterKit,
    TaskList,
    TaskItemSafe.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    ResizableImage,
  ]);
}

/** HTML 안의 이 노트 에셋 상대경로 전부 (중복 제거) */
export function collectAssetRefs(html: string, noteId: string): string[] {
  const re = new RegExp(`assets/${noteId}/[^"')\\s>]+`, "g");
  return [...new Set(html.match(re) ?? [])];
}

/** 상대경로를 data URI로 치환 — 파일 하나로 자급자족하게 */
export function embedAssets(html: string, uris: Map<string, string>): string {
  let out = html;
  for (const [rel, uri] of uris) out = out.replaceAll(rel, uri);
  return out;
}

/**
 * 자급자족 HTML 문서. 스타일은 앱 재현이 아니라 "어디서 열어도 읽기 좋은
 * 문서"가 목표 — 받는 사람의 환경(다크 포함)을 존중한다.
 */
export function buildHtmlDoc(title: string, lang: Lang, bodyHtml: string): string {
  const checkboxNote = translate(lang, "exportedWith");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6;
         font-family: "Segoe UI", "Malgun Gothic", system-ui, sans-serif; }
  h1, h2, h3 { line-height: 1.3; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  pre { padding: 10px 12px; border-radius: 6px; overflow-x: auto;
        background: rgba(127, 127, 127, 0.12); }
  code { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; font-size: 0.92em; }
  blockquote { margin: 0; padding-left: 12px; border-left: 3px solid rgba(127, 127, 127, 0.4); }
  hr { border: 0; border-top: 1px solid rgba(127, 127, 127, 0.4); }
  table { border-collapse: collapse; }
  th, td { border: 1px solid rgba(127, 127, 127, 0.4); padding: 4px 10px; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; gap: 8px; }
  footer { margin-top: 3rem; font-size: 12px; opacity: 0.5; }
</style>
</head>
<body>
${bodyHtml}
<footer>${escapeHtml(checkboxNote)}</footer>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
