import { InputRule } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import Image from "@tiptap/extension-image";
import { TaskItem } from "@tiptap/extension-list";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 체크박스 입력 룰.
 *
 * `- [ ] `처럼 불렛 변환 직후 태스크 변환이 이어지면 기본 wrappingInputRule이
 * bulletList>taskItem(스키마 위반) 구조를 만들다 줄을 유실시킨다(#39, 간헐).
 * 명령 기반 변환(toggleTaskList)은 리스트 구조를 올바르게 바꿔준다.
 */
export const TaskItemSafe = TaskItem.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*(\[([ xX]?)\])\s$/,
        handler: ({ state, range, match, chain }) => {
          const checked = (match[2] || "").toLowerCase() === "x";
          const parent = state.doc.resolve(range.from).node(-1);
          const alreadyTask = parent?.type.name === "taskItem";
          const c = chain().deleteRange(range);
          if (!alreadyTask) c.toggleTaskList();
          if (checked) c.updateAttributes("taskItem", { checked: true });
          // 변환 뒤 커서를 항목의 텍스트 위치로 명시 정규화 — WebKitGTK에서
          // 셀렉션이 붕 떠 이후 타이핑이 버려지는 것을 방지 (#39)
          c.command(({ tr }) => {
            tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)));
            return true;
          });
          c.run();
        },
      }),
    ];
  },
});

/**
 * 이미지 노드의 화면 표시용 확장.
 *
 * 문서(마크다운)에는 `assets/` 상대경로를 그대로 두고, 그릴 때만 asset URL로
 * 바꾼다. 직렬화는 node attrs(상대경로)를 읽으므로 저장 포맷이 오염되지 않는다.
 */
export const assetImage = (base: string) =>
  Image.extend({
    renderHTML({ HTMLAttributes }) {
      const src = String(HTMLAttributes.src ?? "");
      const resolved = src.startsWith("assets/") ? convertFileSrc(`${base}/${src}`) : src;
      return ["img", { ...HTMLAttributes, src: resolved }];
    },
  });
