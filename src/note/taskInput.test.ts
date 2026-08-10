import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { Markdown } from "tiptap-markdown";
import { TaskItemSafe } from "./extensions";

// 실제 타이핑 시뮬레이션: handleTextInput을 거쳐 입력 룰까지 발동시킨다 (#39 재현 경로)
const makeEditor = () =>
  new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItemSafe.configure({ nested: true }),
      Markdown.configure({ html: true }),
    ],
    content: "",
  });

const typeText = (ed: Editor, text: string) => {
  for (const ch of text) {
    const { from, to } = ed.state.selection;
    const call = (f: unknown) =>
      (f as (v: unknown, a: number, b: number, t: string) => boolean)(ed.view, from, to, ch);
    const handled = ed.view.someProp("handleTextInput", call);
    if (!handled) {
      // 실제 에디터처럼: 텍스트 셀렉션이 아니면 입력이 버려진다 —
      // 룰이 셀렉션을 망가뜨리는 회귀(#39)를 가리지 않기 위한 엄격 모드
      if (!(ed.state.selection instanceof TextSelection)) continue;
      ed.view.dispatch(ed.state.tr.insertText(ch, from, to));
    }
  }
};

const pressEnter = (ed: Editor) => ed.commands.keyboardShortcut("Enter");

const md = (ed: Editor) =>
  (ed.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";

describe("체크박스 연속 타이핑 (#39)", () => {
  it("헤딩 → '- [ ] milk' → Enter → 'eggs' 시퀀스에서 유실 없음", () => {
    const ed = makeEditor();
    typeText(ed, "# Groceries");
    pressEnter(ed);
    typeText(ed, "- [ ] milk");
    pressEnter(ed);
    typeText(ed, "eggs");
    const out = md(ed);
    expect(out).toContain("# Groceries");
    expect(out).toContain("[ ] milk");
    expect(out).toContain("eggs");
    ed.destroy();
  });

  it("대시 없는 '[ ] milk'도 체크박스 생성", () => {
    const ed = makeEditor();
    typeText(ed, "[ ] milk");
    expect(md(ed)).toContain("[ ] milk");
    ed.destroy();
  });

  it("'[x] done'은 체크된 상태로", () => {
    const ed = makeEditor();
    typeText(ed, "[x] done");
    expect(md(ed)).toContain("[x] done");
    ed.destroy();
  });
});
