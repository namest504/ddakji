import { useEffect, useRef } from "react";
import { InputRule } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { convertFileSrc } from "@tauri-apps/api/core";

// `- [ ] `처럼 불렛 변환 직후 태스크 변환이 이어지면 기본 wrappingInputRule이
// bulletList>taskItem(스키마 위반) 구조를 만들다 줄을 유실시킨다(#39, 간헐).
// 명령 기반 변환(toggleTaskList)은 리스트 구조를 올바르게 바꿔준다.
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

// 문서(마크다운)에는 assets/ 상대경로를 그대로 두고, 화면에 그릴 때만 asset URL로 변환한다.
// 직렬화는 node attrs(상대경로)를 읽으므로 저장 포맷이 오염되지 않는다.
const assetImage = (base: string) =>
  Image.extend({
    renderHTML({ HTMLAttributes }) {
      const src = String(HTMLAttributes.src ?? "");
      const resolved = src.startsWith("assets/") ? convertFileSrc(`${base}/${src}`) : src;
      return ["img", { ...HTMLAttributes, src: resolved }];
    },
  });

interface Props {
  body: string; // 초기 마크다운 (마운트 시 1회 — 이후 진실은 에디터)
  base: string; // 데이터 루트 (asset URL 변환용)
  onChange: (md: string) => void;
  onEditor: (e: Editor | null) => void; // 서식 바·이미지 삽입·재시도용
  onPasteFile: (file: File, pos?: number) => void; // 이미지 붙여넣기/드롭 → 저장·삽입은 NoteApp이 담당
}

export default function RichEditor({ body, base, onChange, onEditor, onPasteFile }: Props) {
  const pasteRef = useRef(onPasteFile);
  pasteRef.current = onPasteFile;

  const editor = useEditor({
    extensions: [
      StarterKit,
      // 체크박스: `- [ ] `/`[ ] ` 입력으로 생성, 클릭 토글, GFM(- [x])으로 저장
      TaskList,
      TaskItemSafe.configure({ nested: true }),
      // GFM 표 (#71) — 리사이즈 핸들은 끔 (마크다운에 폭을 저장할 수 없다)
      TableKit.configure({ table: { resizable: false } }),
      assetImage(base),
      // transformPastedText: 마크다운 텍스트를 붙여넣으면 서식으로 파싱 (#72)
      Markdown.configure({ html: true, transformPastedText: true }),
    ],
    content: body,
    autofocus: "end",
    editorProps: {
      attributes: { class: "editor tiptap" },
      handlePaste: (_view, event) => {
        const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
          i.type.startsWith("image/")
        );
        const file = item?.getAsFile();
        if (!file) return false;
        pasteRef.current(file);
        return true;
      },
      // 파일 드롭은 놓은 위치에 삽입. 내부 노드 이동(moved)은 ProseMirror 기본
      // 처리에 맡긴다 — 이미지 드래그 재배치가 이 경로다.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        for (const f of files) pasteRef.current(f, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const storage = editor.storage as { markdown?: { getMarkdown: () => string } };
      onChange(storage.markdown?.getMarkdown() ?? "");
    },
  });

  useEffect(() => {
    onEditor(editor ?? null);
    return () => onEditor(null);
  }, [editor, onEditor]);

  return <EditorContent editor={editor} className="content-editor" />;
}
