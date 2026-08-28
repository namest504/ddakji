import { useLayoutEffect, useRef } from "react";
import type { NoteColor } from "../lib/api";

/** 우클릭 메뉴 항목 (#172). 메뉴는 표시만 하고 동작은 전부 호출자가 넘긴다. */
export type CtxEntry =
  | { kind: "item"; label: string; onClick: () => void; disabled?: boolean; checked?: boolean }
  | { kind: "sep" }
  | { kind: "swatches"; current: NoteColor; onPick: (c: NoteColor) => void };

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];

/**
 * 노트 우클릭 컨텍스트 메뉴 (#172). WebView2 기본 메뉴를 대신한다.
 *
 * 닫기(바깥 클릭·Esc·blur)는 호출자(NoteApp)가 관리한다 — 메뉴가 스스로
 * 전역 리스너를 걸면 열림/닫힘 상태의 주인이 둘이 된다.
 */
export default function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: CtxEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 노트 창은 좁다 — 메뉴가 창 밖으로 나가면 눌리지 않으니 안쪽으로 민다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const ny = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
  }, [x, y]);

  return (
    <div className="ctx-menu" ref={ref} style={{ left: x, top: y }} role="menu">
      {entries.map((e, i) => {
        if (e.kind === "sep") return <div key={i} className="ctx-sep" />;
        if (e.kind === "swatches")
          return (
            <div key={i} className="ctx-swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={"swatch" + (c === e.current ? " active" : "")}
                  data-color={c}
                  onClick={() => {
                    e.onPick(c);
                    onClose();
                  }}
                />
              ))}
            </div>
          );
        return (
          <button
            key={i}
            className="ctx-item"
            role="menuitem"
            disabled={e.disabled}
            onClick={() => {
              e.onClick();
              onClose();
            }}
          >
            <span className="ctx-check">{e.checked ? "✓" : ""}</span>
            {e.label}
          </button>
        );
      })}
    </div>
  );
}
