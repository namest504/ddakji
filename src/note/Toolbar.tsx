import { useState } from "react";
import type { Note, NoteColor } from "../lib/api";

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];

interface Props {
  note: Note;
  onColor: (c: NoteColor) => void;
  onToggleViewer: () => void;
  onPin: () => void;
  onFontDelta: (d: number) => void;
  onNew: () => void;
  onDelete: () => void;
  onOpenList: () => void;
}

export default function Toolbar(p: Props) {
  const [showColors, setShowColors] = useState(false);
  const m = p.note.meta;
  return (
    <div className="toolbar" data-tauri-drag-region>
      <button title="새 노트" onClick={p.onNew}>＋</button>
      <button title="색상" onClick={() => setShowColors(!showColors)}>🎨</button>
      <button title={m.viewer_mode ? "편집 모드" : "뷰어 모드"} onClick={p.onToggleViewer}>
        {m.viewer_mode ? "✏️" : "👁"}
      </button>
      <button title="항상 위" className={m.always_on_top ? "active" : ""} onClick={p.onPin}>📌</button>
      <span className="spacer" data-tauri-drag-region />
      <button title="글씨 작게" onClick={() => p.onFontDelta(-1)}>A−</button>
      <button title="글씨 크게" onClick={() => p.onFontDelta(1)}>A＋</button>
      <button title="노트 목록" onClick={p.onOpenList}>☰</button>
      <button title="삭제" onClick={p.onDelete}>🗑</button>
      {showColors && (
        <div className="color-row">
          {COLORS.map((c) => (
            <button key={c} className="swatch" data-color={c}
              onClick={() => { p.onColor(c); setShowColors(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}
