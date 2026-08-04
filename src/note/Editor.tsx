interface Props {
  noteId: string;
  value: string;
  onChange: (v: string) => void;
  onPasteImage?: (file: File, selStart: number, selEnd: number) => void;
}

export default function Editor({ value, onChange, onPasteImage }: Props) {
  return (
    <textarea
      className="editor"
      value={value}
      placeholder="메모를 입력하세요… (마크다운 지원)"
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
        const file = item?.getAsFile();
        if (file && onPasteImage) {
          e.preventDefault();
          // Capture the selection synchronously — by the time the image save
          // (async) resolves, both the textarea's selection and the note body
          // may have moved on. The caller re-validates against the live body.
          const { selectionStart: s, selectionEnd: en } = e.currentTarget;
          onPasteImage(file, s, en);
        }
      }}
      autoFocus
    />
  );
}
