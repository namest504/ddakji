import { useState } from "react";
import * as api from "../lib/api";
import type { FontFamily, Note, NoteColor } from "../lib/api";
import { fontStack } from "../lib/noteUtils";
import { CloseIcon, GroupIcon, ListIcon, PinIcon, PlusIcon, PopOutIcon, TrashIcon } from "./icons";

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];
const FONTS: { key: FontFamily; label: string }[] = [
  { key: "system", label: "시스템" },
  { key: "serif", label: "세리프" },
  { key: "mono", label: "고정폭" },
];

interface Props {
  note: Note;
  onColor: (c: NoteColor) => void;
  onFont: (f: FontFamily) => void;
  onGroup: (name: string | null) => void;
  canPopOut: boolean;
  onPopOut: () => void;
  onPin: () => void;
  onFontDelta: (d: number) => void;
  onNew: () => void;
  onDelete: () => void;
  onOpenList: () => void;
  onClose: () => void;
}

export default function Toolbar(p: Props) {
  const [popover, setPopover] = useState<"colors" | "fonts" | "groups" | null>(null);
  const [favFonts, setFavFonts] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const toggle = (v: "colors" | "fonts" | "groups") => {
    // 목록성 데이터는 팝오버를 열 때마다 새로 읽는다
    if (v === "fonts" && popover !== "fonts") {
      api.getSettings().then((s) => setFavFonts(s.favorite_fonts)).catch(() => {});
    }
    if (v === "groups" && popover !== "groups") {
      api.listGroups().then(setGroups).catch(() => {});
    }
    setPopover(popover === v ? null : v);
  };
  const m = p.note.meta;
  return (
    <div className="toolbar" data-tauri-drag-region>
      <button title="새 노트 (Ctrl+N)" onClick={p.onNew}><PlusIcon /></button>
      {/* 색상 버튼은 글리프 대신 현재 노트 색 스와치 — 상태 표시를 겸한다 */}
      <button title="색상" onClick={() => toggle("colors")}>
        <span className="swatch-current" />
      </button>
      <button title="폰트" className="font-btn" onClick={() => toggle("fonts")}>Aa</button>
      <button title="모음집" className={m.group ? "active" : ""} onClick={() => toggle("groups")}>
        <GroupIcon />
      </button>
      {p.canPopOut && (
        <button title="새 창으로 꺼내기 (Ctrl+Shift+P)" onClick={p.onPopOut}><PopOutIcon /></button>
      )}
      <button title="항상 위" className={m.always_on_top ? "active" : ""} onClick={p.onPin}>
        <PinIcon filled={m.always_on_top} />
      </button>
      <span className="spacer" data-tauri-drag-region />
      <button title="글씨 작게" className="font-btn" onClick={() => p.onFontDelta(-1)}>A−</button>
      <button title="글씨 크게" className="font-btn" onClick={() => p.onFontDelta(1)}>A＋</button>
      <button title="노트 목록 (Ctrl+L)" onClick={p.onOpenList}><ListIcon /></button>
      <button title="삭제" onClick={p.onDelete}><TrashIcon /></button>
      <button title="닫기 (Ctrl+W, 트레이로 숨김)" onClick={p.onClose}><CloseIcon /></button>
      {popover === "colors" && (
        <div className="color-row">
          {COLORS.map((c) => (
            <button key={c} className="swatch" data-color={c}
              onClick={() => { p.onColor(c); setPopover(null); }} />
          ))}
        </div>
      )}
      {popover === "groups" && (
        <div className="color-row font-row">
          {groups.map((g) => (
            <button key={g} className={m.group === g ? "active" : ""}
              onClick={() => { p.onGroup(g); setPopover(null); }}>
              {g}
            </button>
          ))}
          <input className="font-custom" placeholder="새 모음집 이름" autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = e.currentTarget.value.trim();
                e.currentTarget.blur();
                if (v) { p.onGroup(v); setPopover(null); }
              }
              if (e.key === "Escape") {
                e.currentTarget.blur();
                setPopover(null);
              }
            }} />
          {m.group && (
            <button onClick={() => { p.onGroup(null); setPopover(null); }}>제외</button>
          )}
        </div>
      )}
      {popover === "fonts" && (
        <div className="color-row font-row">
          {FONTS.map((f) => (
            <button key={f.key} className={m.font_family === f.key ? "active" : ""}
              style={{ fontFamily: fontStack(f.key) }}
              onClick={() => { p.onFont(f.key); setPopover(null); }}>
              {f.label}
            </button>
          ))}
          {favFonts.map((f) => (
            <button key={f} className={m.font_family === f ? "active" : ""}
              style={{ fontFamily: fontStack(f) }}
              onClick={() => { p.onFont(f); setPopover(null); }}>
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
