import { useState } from "react";
import type { Note, NoteColor } from "../lib/api";
import { EyeIcon, ListIcon, PencilIcon, PinIcon, PlusIcon, TrashIcon } from "./icons";

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];

interface Props {
  note: Note;
  viewerMode: boolean;
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
      <button title="새 노트" onClick={p.onNew}><PlusIcon /></button>
      {/* 색상 버튼은 글리프 대신 현재 노트 색 스와치 — 상태 표시를 겸한다 */}
      <button title="색상" onClick={() => setShowColors(!showColors)}>
        <span className="swatch-current" />
      </button>
      <button title={p.viewerMode ? "편집" : "미리보기"} onClick={p.onToggleViewer}>
        {p.viewerMode ? <PencilIcon /> : <EyeIcon />}
      </button>
      <button title="항상 위" className={m.always_on_top ? "active" : ""} onClick={p.onPin}>
        <PinIcon filled={m.always_on_top} />
      </button>
      <span className="spacer" data-tauri-drag-region />
      <button title="글씨 작게" className="font-btn" onClick={() => p.onFontDelta(-1)}>A−</button>
      <button title="글씨 크게" className="font-btn" onClick={() => p.onFontDelta(1)}>A＋</button>
      <button title="노트 목록" onClick={p.onOpenList}><ListIcon /></button>
      <button title="삭제" onClick={p.onDelete}><TrashIcon /></button>
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
