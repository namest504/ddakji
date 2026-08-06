import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { Markdown } from "tiptap-markdown";
import { TaskItemSafe } from "./RichEditor";

// 서식 바 버튼이 실제로 부르는 명령(FormatBar.tsx)과 입력 룰의 회귀 테스트.
// 에디터 구성은 RichEditor와 동일 (assetImage 제외 — 경로 변환은 무관).
const makeEditor = (content = "") =>
  new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItemSafe.configure({ nested: true }),
      Markdown.configure({ html: true }),
    ],
    content,
  });

const md = (ed: Editor) =>
  (ed.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";

// taskInput.test.ts와 같은 타이핑 하네스 — handleTextInput 경유로 입력 룰까지 발동
const typeText = (ed: Editor, text: string) => {
  for (const ch of text) {
    const { from, to } = ed.state.selection;
    const call = (f: unknown) =>
      (f as (v: unknown, a: number, b: number, t: string) => boolean)(ed.view, from, to, ch);
    const handled = ed.view.someProp("handleTextInput", call);
    if (!handled) {
      if (!(ed.state.selection instanceof TextSelection)) continue;
      ed.view.dispatch(ed.state.tr.insertText(ch, from, to));
    }
  }
};

describe("서식 지우개 (clearNodes + unsetAllMarks)", () => {
  it("헤딩·굵게가 섞인 선택을 평문 문단으로 되돌린다", () => {
    const ed = makeEditor("# 제목\n\n**굵게** 본문");
    ed.commands.selectAll();
    ed.chain().focus().clearNodes().unsetAllMarks().run();
    const out = md(ed);
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).toContain("제목");
    expect(out).toContain("굵게 본문");
    ed.destroy();
  });

  it("체크박스 목록도 평문으로 풀린다", () => {
    const ed = makeEditor("- [ ] 할일\n- [x] 완료");
    ed.commands.selectAll();
    ed.chain().focus().clearNodes().unsetAllMarks().run();
    const out = md(ed);
    expect(out).not.toContain("[ ]");
    expect(out).not.toContain("[x]");
    expect(out).toContain("할일");
    expect(out).toContain("완료");
    ed.destroy();
  });
});

describe("들여쓰기/내어쓰기 (sink/liftListItem)", () => {
  it("두 번째 항목을 들여쓰면 중첩 목록, 내어쓰면 복귀", () => {
    const ed = makeEditor("- 상위\n- 하위");
    ed.commands.focus("end"); // 커서를 마지막 항목으로
    expect(ed.commands.sinkListItem("listItem")).toBe(true);
    expect(md(ed)).toMatch(/- 상위\n\s+- 하위/);
    expect(ed.commands.liftListItem("listItem")).toBe(true);
    expect(md(ed)).toMatch(/- 상위\n- 하위/);
    ed.destroy();
  });

  it("첫 항목은 더 들여쓸 수 없다", () => {
    const ed = makeEditor("- 유일한 항목");
    ed.commands.focus("end");
    expect(ed.commands.sinkListItem("listItem")).toBe(false);
    ed.destroy();
  });
});

describe("입력 룰로 만든 구조 (타이핑 경로)", () => {
  it("'# ' 타이핑으로 헤딩 생성", () => {
    const ed = makeEditor();
    typeText(ed, "# 오늘의 메모");
    expect(md(ed)).toContain("# 오늘의 메모");
    ed.destroy();
  });

  it("'- ' 타이핑으로 불렛 생성, Enter 후 다음 항목 유지", () => {
    const ed = makeEditor();
    typeText(ed, "- 항목");
    ed.commands.keyboardShortcut("Enter");
    typeText(ed, "다음");
    const out = md(ed);
    expect(out).toMatch(/- 항목/);
    expect(out).toMatch(/- 다음/);
    ed.destroy();
  });

  it("'1. ' 타이핑으로 순서 목록 생성", () => {
    const ed = makeEditor();
    typeText(ed, "1. 첫째");
    expect(md(ed)).toMatch(/1\.\s+첫째/);
    ed.destroy();
  });
});
