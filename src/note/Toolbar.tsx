import { useState } from "react";
import * as api from "../lib/api";
import { useT, type MsgKey } from "../lib/i18n";
import type { FontFamily, Note, NoteColor } from "../lib/api";
import { fontStack } from "../lib/noteUtils";
import { CloseIcon, HideIcon, ListIcon, PinIcon, PlusIcon, PopOutIcon } from "./icons";

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];
const FONTS: { key: FontFamily; label: MsgKey }[] = [
  { key: "system", label: "fontSystem" },
  { key: "serif", label: "fontSerif" },
  { key: "mono", label: "fontMono" },
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
  const t = useT();
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
      <button title={t("newNote")} onClick={p.onNew}>
        <PlusIcon />
      </button>
      {/* 색상 버튼은 글리프 대신 현재 노트 색 스와치 — 상태 표시를 겸한다 */}
      <button title={t("color")} onClick={() => toggle("colors")}>
        <span className="swatch-current" />
      </button>
      <button title={t("font")} className="font-btn" onClick={() => toggle("fonts")}>
        Aa
      </button>
      {p.canPopOut && (
        <button title={t("popOut")} onClick={p.onPopOut}>
          <PopOutIcon />
        </button>
      )}
      <button
        title={t("alwaysOnTop")}
        className={m.always_on_top ? "active" : ""}
        onClick={p.onPin}
      >
        <PinIcon filled={m.always_on_top} />
      </button>
      <span className="spacer" data-tauri-drag-region />
      <button title={t("fontSmaller")} className="font-btn" onClick={() => p.onFontDelta(-1)}>
        A−
      </button>
      <button title={t("fontBigger")} className="font-btn" onClick={() => p.onFontDelta(1)}>
        A＋
      </button>
      <button title={t("openList")} onClick={p.onOpenList}>
        <ListIcon />
      </button>
      {p.canHideNote && (
        <button title={t("hideNote")} onClick={p.onHideNote}>
          <HideIcon />
        </button>
      )}
      <button title={p.canHideNote ? t("hideWindow") : t("hideSolo")} onClick={p.onClose}>
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
              {t(f.label)}
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
