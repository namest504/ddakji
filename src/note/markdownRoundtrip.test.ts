import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { MIN_IMAGE_WIDTH, ResizableImage, clampImageWidth } from "./extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";

// 에디터가 마크다운을 읽고 다시 직렬화했을 때 의미가 보존되는지 (QA #2 대체).
// 표기 정규화(예: * → **)는 허용하되, 구조·내용·경로가 살아야 한다.
const roundtrip = (src: string): string => {
  const ed = new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      ResizableImage,
      Markdown.configure({ html: true }),
    ],
    content: src,
  });
  const out =
    (ed.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
  ed.destroy();
  return out;
};

const makeEditor = (content: string) =>
  new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      ResizableImage,
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

  it("크기를 지정하지 않은 이미지는 평문 마크다운 그대로", () => {
    // 손대지 않은 이미지에까지 HTML을 물리지 않는다 (#113)
    const out = roundtrip("![](assets/abc/img.png)");
    expect(out).toContain("![](assets/abc/img.png)");
    expect(out).not.toContain("<img");
  });

  it("크기를 지정한 이미지는 폭이 살아남는다", () => {
    const out = roundtrip('<img src="assets/abc/img.png" alt="" width="240">');
    expect(out).toContain("assets/abc/img.png");
    expect(out).toContain('width="240"');
  });

  it("alt의 따옴표가 속성 경계를 만들지 않는다", () => {
    // 붙여넣기·가져오기·CLI로 무엇이든 들어온다. 이스케이프하지 않으면
    // alt="x" onerror="boom" 처럼 없던 속성이 생긴 꼴로 다시 읽힌다
    const out = roundtrip(
      '<img src="assets/a/i.png" alt="x&quot; onerror=&quot;boom" width="120">',
    );
    expect(out).toContain('width="120"');
    expect(out).not.toContain('" onerror="');
    expect(out).toContain("&quot; onerror=&quot;");
  });

  it("괄호·공백이 든 경로도 다시 읽으면 그대로다", () => {
    // 링크 문법이 경로 중간에서 끊기면 두 번째 왕복에서 경로가 달라진다
    const once = roundtrip("![](<assets/a b(1)/i.png>)");
    expect(roundtrip(once)).toBe(once);
  });

  it("style로 들어온 폭도 읽는다", () => {
    const out = roundtrip('<img src="assets/abc/img.png" style="width: 180px">');
    expect(out).toContain('width="180"');
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

  it("GFM 표 — 헤더·셀·구조 보존 (#71)", () => {
    const out = roundtrip(
      "| 입력 | 동작 |\n| --- | --- |\n| `Esc` | 노멀 모드 |\n| `i` | 커서 앞 입력 |",
    );
    expect(out).toContain("| 입력 | 동작 |");
    expect(out).toMatch(/\| ---+ \| ---+ \|/);
    expect(out).toContain("노멀 모드");
    expect(out).toContain("커서 앞 입력");
    // 셀 안 인라인 코드도 유지
    expect(out).toContain("`Esc`");
  });
});

describe("이미지 크기 clamp (#113)", () => {
  it("최소 폭 아래로는 줄지 않는다 — 잡을 수 없게 되면 되돌릴 방법이 없다", () => {
    expect(clampImageWidth(200, -500, 600)).toBe(MIN_IMAGE_WIDTH);
  });

  it("노트 폭을 넘지 않는다", () => {
    expect(clampImageWidth(200, 500, 320)).toBe(320);
  });

  it("그 사이에서는 끈 만큼 따라온다", () => {
    expect(clampImageWidth(200, 40, 600)).toBe(240);
    expect(clampImageWidth(200, -40, 600)).toBe(160);
  });

  it("노트가 최소 폭보다 좁아도 최소 폭은 지킨다", () => {
    expect(clampImageWidth(200, 0, 10)).toBe(MIN_IMAGE_WIDTH);
  });
});
