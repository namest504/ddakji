import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { TaskItemSafe, assetImage } from "./extensions";
import { fromEditorMarkdown, toEditorMarkdown } from "../lib/mdCompat";

interface Props {
  body: string; // 초기 마크다운 (마운트 시 1회 — 이후 진실은 에디터)
  base: string; // 데이터 루트 (asset URL 변환용)
  onChange: (md: string) => void;
  onEditor: (e: Editor | null) => void; // 서식 바·이미지 삽입·재시도용
  onPasteFile: (file: File, pos?: number) => void; // 저장·삽입은 NoteApp이 담당
}

export default function RichEditor({ body, base, onChange, onEditor, onPasteFile }: Props) {
  // 에디터는 한 번만 만든다 — 최신 콜백은 ref로 넘겨 재생성을 피한다
  const pasteRef = useRef(onPasteFile);
  useEffect(() => {
    pasteRef.current = onPasteFile;
  }, [onPasteFile]);

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
    // 빈 체크박스 증식 버그(#166)의 관문 — 들어갈 때 주입, 나올 때 제거
    content: toEditorMarkdown(body),
    autofocus: "end",
    editorProps: {
      attributes: { class: "editor tiptap" },
      handlePaste: (_view, event) => {
        const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
          i.type.startsWith("image/"),
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
          f.type.startsWith("image/"),
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
      onChange(fromEditorMarkdown(storage.markdown?.getMarkdown() ?? ""));
    },
  });

  useEffect(() => {
    onEditor(editor ?? null);
    return () => onEditor(null);
  }, [editor, onEditor]);

  return <EditorContent editor={editor} className="content-editor" />;
}
