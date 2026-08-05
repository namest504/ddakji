import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { convertFileSrc } from "@tauri-apps/api/core";

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
  onPasteFile: (file: File) => void; // 이미지 붙여넣기 → 저장·삽입은 NoteApp이 담당
}

export default function RichEditor({ body, base, onChange, onEditor, onPasteFile }: Props) {
  const pasteRef = useRef(onPasteFile);
  pasteRef.current = onPasteFile;

  const editor = useEditor({
    extensions: [StarterKit, assetImage(base), Markdown.configure({ html: true })],
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
