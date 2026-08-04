interface Props {
  noteId: string;
  value: string;
  onChange: (v: string) => void;
  onPasteImage?: (file: File, insert: (md: string) => void) => void;
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
          const ta = e.currentTarget;
          onPasteImage(file, (md) => {
            const { selectionStart: s, selectionEnd: en } = ta;
            onChange(value.slice(0, s) + md + value.slice(en));
          });
        }
      }}
      autoFocus
    />
  );
}
