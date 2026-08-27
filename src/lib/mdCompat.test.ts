import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { Markdown } from "tiptap-markdown";
import { TaskItemSafe } from "../note/extensions";
import { fromEditorMarkdown, toEditorMarkdown } from "./mdCompat";

const roundtrip = (body: string): string => {
  const ed = new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItemSafe.configure({ nested: true }),
      Markdown.configure({ html: true }),
    ],
    content: toEditorMarkdown(body),
  });
  const out = (ed.storage as { markdown?: { getMarkdown: () => string } }).markdown!.getMarkdown();
  ed.destroy();
  return fromEditorMarkdown(out);
};

describe("빈 체크박스 왕복 (#166)", () => {
  it("증식하던 실패 사례가 고정점이 된다 — 복제도 강등도 없이", () => {
    const src = "- [ ] \n\n- 텍스트\n\n- [x] 완료";
    const once = roundtrip(src);
    expect(once).not.toContain("\\[");
    expect(once).toContain("- [ ]");
    expect(once).toContain("- [x] 완료");
    // 두 번 돌려도 같아야 한다 — 고정점이 아니면 재시작마다 자란다
    expect(roundtrip(once)).toBe(once);
    // 체크박스 개수 보존 (빈 것 1 + 완료 1)
    expect((once.match(/- \[[ x]\]/g) ?? []).length).toBe(2);
  });

  it("단독 빈 체크박스도 리터럴 불릿으로 강등되지 않는다", () => {
    const once = roundtrip("- [ ] \n");
    expect(once).not.toContain("\\[");
    expect(once).toContain("- [ ]");
    expect(roundtrip(once)).toBe(once);
  });

  it("자리표시자는 디스크에 남지 않고, 내용이 생기면 흔적 없이 사라진다", () => {
    expect(toEditorMarkdown("- [ ] \n")).toContain("\u200b");
    expect(fromEditorMarkdown(toEditorMarkdown("- [ ] \n"))).toBe("- [ ] \n".replace(/ $/m, " "));
    expect(roundtrip("- [ ] 우유\n")).not.toContain("\u200b");
  });
});
