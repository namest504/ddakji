import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "tiptap-markdown";

// 에디터가 마크다운을 읽고 다시 직렬화했을 때 의미가 보존되는지 (QA #2 대체).
// 표기 정규화(예: * → **)는 허용하되, 구조·내용·경로가 살아야 한다.
const roundtrip = (src: string): string => {
  const ed = new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Markdown.configure({ html: true }),
    ],
    content: src,
  });
  const out = (ed.storage as { markdown?: { getMarkdown: () => string } })
    .markdown?.getMarkdown() ?? "";
  ed.destroy();
  return out;
};

const makeEditor = (content: string) =>
  new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Markdown.configure({ html: true }),
    ],
    content,
  });

const getMd = (ed: Editor) =>
  (ed.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";

describe("불렛→체크박스 변환 명령 (#39 회귀)", () => {
  it("불렛 항목에서 toggleTaskList — 텍스트 보존 + 체크박스 생성", () => {
    const ed = makeEditor("- 우유\n- 계란");
    ed.commands.setTextSelection(4);
    ed.commands.toggleTaskList();
    const md = getMd(ed);
    expect(md).toContain("우유");
    expect(md).toContain("계란");
    expect(md).toContain("[ ]");
    ed.destroy();
  });

  it("문단에서 toggleTaskList — 체크박스 목록 생성", () => {
    const ed = makeEditor("우유");
    ed.commands.selectAll();
    ed.commands.toggleTaskList();
    expect(getMd(ed)).toContain("[ ] 우유");
    ed.destroy();
  });
});

describe("마크다운 왕복 보존", () => {
  it("제목·본문", () => {
    const out = roundtrip("# 검사 종류\n\n첫 설치 인수검사");
    expect(out).toContain("# 검사 종류");
    expect(out).toContain("첫 설치 인수검사");
  });

  it("불렛 목록과 중첩", () => {
    const out = roundtrip("- 상위\n  - 하위\n- 다음");
    expect(out).toMatch(/- 상위/);
    expect(out).toMatch(/\n\s+- 하위/);
  });

  it("체크박스 상태", () => {
    const out = roundtrip("- [ ] 할 일\n- [x] 끝난 일");
    expect(out).toContain("[ ] 할 일");
    expect(out).toContain("[x] 끝난 일");
  });

  it("이미지 상대경로", () => {
    const out = roundtrip("![](assets/abc/img.png)");
    expect(out).toContain("assets/abc/img.png");
  });

  it("굵게·기울임·취소선", () => {
    const out = roundtrip("**굵게** *기울임* ~~취소~~");
    expect(out).toContain("**굵게**");
    expect(out).toMatch(/[*_]기울임[*_]/);
    expect(out).toContain("~~취소~~");
  });

  it("밑줄(<u> 인라인 HTML)", () => {
    const out = roundtrip("<u>밑줄</u> 텍스트");
    expect(out).toContain("<u>밑줄</u>");
  });

  it("코드 블록·인라인 코드", () => {
    const out = roundtrip("`인라인`\n\n```\n코드 블록\n```");
    expect(out).toContain("`인라인`");
    expect(out).toContain("코드 블록");
  });

  it("인용·구분선", () => {
    const out = roundtrip("> 인용문\n\n---");
    expect(out).toContain("> 인용문");
    expect(out).toMatch(/---|\*\*\*/);
  });

  it("순서 목록", () => {
    const out = roundtrip("1. 첫째\n2. 둘째");
    expect(out).toMatch(/1\.\s+첫째/);
    expect(out).toMatch(/2\.\s+둘째/);
  });

  it("링크 텍스트와 주소", () => {
    const out = roundtrip("[문서](https://example.com/a?b=1)");
    expect(out).toContain("[문서]");
    expect(out).toContain("https://example.com/a?b=1");
  });

  it("중첩 체크박스 구조", () => {
    const out = roundtrip("- [ ] 상위\n  - [x] 하위");
    expect(out).toContain("[ ] 상위");
    expect(out).toMatch(/\n\s+- \[x\] 하위/);
  });
});
