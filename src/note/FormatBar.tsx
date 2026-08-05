import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/react";
import { ImageIcon, ListIcon } from "./icons";

// 하단 서식 바 (#18) — MS Sticky Notes의 하단 바 참고: B/I/U/취소선/목록/이미지.
// 단축키는 TipTap 내장: Ctrl+B/I/U, Ctrl+Shift+S(취소선)
export default function FormatBar({ editor, onAddImage }: {
  editor: Editor | null;
  onAddImage: () => void;
}) {
  // 선택 위치가 바뀔 때 active 상태를 갱신하기 위한 강제 리렌더
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", force);
    return () => { editor.off("transaction", force); };
  }, [editor]);

  const btn = (
    title: string,
    active: boolean | undefined,
    run: () => void,
    label: React.ReactNode
  ) => (
    <button title={title} className={active ? "active" : ""}
      onMouseDown={(e) => e.preventDefault() /* 에디터 포커스 유지 */}
      onClick={run}>
      {label}
    </button>
  );

  return (
    <div className="format-bar">
      {btn("굵게 (Ctrl+B)", editor?.isActive("bold"),
        () => editor?.chain().focus().toggleBold().run(), <b>B</b>)}
      {btn("기울임 (Ctrl+I)", editor?.isActive("italic"),
        () => editor?.chain().focus().toggleItalic().run(), <i>I</i>)}
      {btn("밑줄 (Ctrl+U)", editor?.isActive("underline"),
        () => editor?.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {btn("취소선 (Ctrl+Shift+S)", editor?.isActive("strike"),
        () => editor?.chain().focus().toggleStrike().run(), <s>ab</s>)}
      {btn("글머리 목록", editor?.isActive("bulletList"),
        () => editor?.chain().focus().toggleBulletList().run(), <ListIcon />)}
      <span className="spacer" />
      {btn("이미지 삽입", false, onAddImage, <ImageIcon />)}
    </div>
  );
}
