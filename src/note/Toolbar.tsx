import { useState } from "react";
import * as api from "../lib/api";
import type { FontFamily, Note, NoteColor } from "../lib/api";
import { fontStack } from "../lib/noteUtils";
import { CloseIcon, HideIcon, ListIcon, PinIcon, PlusIcon, PopOutIcon } from "./icons";

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
  canPopOut: boolean;
  onPopOut: () => void;
  onPin: () => void;
  onFontDelta: (d: number) => void;
  onNew: () => void;
  onOpenList: () => void;
  /** 모음집일 때만 — 이 장만 치우는 버튼을 낸다 */
  canHideNote: boolean;
  onHideNote: () => void;
  onClose: () => void;
}

export default function Toolbar(p: Props) {
  const [popover, setPopover] = useState<"colors" | "fonts" | null>(null);
  const [favFonts, setFavFonts] = useState<string[]>([]);
  const toggle = (v: "colors" | "fonts") => {
    // 목록성 데이터는 팝오버를 열 때마다 새로 읽는다
    if (v === "fonts" && popover !== "fonts") {
      api
        .getSettings()
        .then((s) => setFavFonts(s.favorite_fonts))
        .catch(() => {});
    }
    setPopover(popover === v ? null : v);
  };
  const m = p.note.meta;
  return (
    <div className="toolbar" data-tauri-drag-region>
      <button title="새 노트 (Ctrl+N)" onClick={p.onNew}>
        <PlusIcon />
      </button>
      {/* 색상 버튼은 글리프 대신 현재 노트 색 스와치 — 상태 표시를 겸한다 */}
      <button title="색상" onClick={() => toggle("colors")}>
        <span className="swatch-current" />
      </button>
      <button title="폰트" className="font-btn" onClick={() => toggle("fonts")}>
        Aa
      </button>
      {p.canPopOut && (
        <button title="모음집에서 꺼내기 (Ctrl+Shift+P)" onClick={p.onPopOut}>
          <PopOutIcon />
        </button>
      )}
      <button title="항상 위" className={m.always_on_top ? "active" : ""} onClick={p.onPin}>
        <PinIcon filled={m.always_on_top} />
      </button>
      <span className="spacer" data-tauri-drag-region />
      <button title="글씨 작게" className="font-btn" onClick={() => p.onFontDelta(-1)}>
        A−
      </button>
      <button title="글씨 크게" className="font-btn" onClick={() => p.onFontDelta(1)}>
        A＋
      </button>
      <button title="노트 목록 (Ctrl+L)" onClick={p.onOpenList}>
        <ListIcon />
      </button>
      {p.canHideNote && (
        <button title="이 장만 숨기기 (Ctrl+W) — 창은 다음 장으로" onClick={p.onHideNote}>
          <HideIcon />
        </button>
      )}
      <button
        title={
          p.canHideNote
            ? "이 창 숨기기 (Ctrl+Shift+W) — 모음집 전체"
            : "숨기기 (Ctrl+W) — 목록에서 다시 열 수 있다"
        }
        onClick={p.onClose}
      >
        <CloseIcon />
      </button>
      {popover === "colors" && (
        <div className="color-row">
          {COLORS.map((c) => (
            <button
              key={c}
              className="swatch"
              data-color={c}
              onClick={() => {
                p.onColor(c);
                setPopover(null);
              }}
            />
          ))}
        </div>
      )}
      {popover === "fonts" && (
        <div className="color-row font-row">
          {FONTS.map((f) => (
            <button
              key={f.key}
              className={m.font_family === f.key ? "active" : ""}
              style={{ fontFamily: fontStack(f.key) }}
              onClick={() => {
                p.onFont(f.key);
                setPopover(null);
              }}
            >
              {f.label}
            </button>
          ))}
          {favFonts.map((f) => (
            <button
              key={f}
              className={m.font_family === f ? "active" : ""}
              style={{ fontFamily: fontStack(f) }}
              onClick={() => {
                p.onFont(f);
                setPopover(null);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
