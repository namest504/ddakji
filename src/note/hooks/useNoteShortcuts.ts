import { useEffect } from "react";
import * as api from "../../lib/api";

interface Handlers {
  changeFont: (delta: number) => void;
  navigate: (dir: 1 | -1) => void;
  popOut: () => void;
  flushBody: () => void;
  /** 이 장만 숨기기 */
  hideNote: () => void;
  /** 이 창(모음집 전체) 숨기기 */
  hideWindow: () => void;
}

/**
 * 노트 창 단축키. 툴바 툴팁과 `docs/usage.md`의 표가 이 목록과 같아야 한다.
 *
 * | 키 | 동작 |
 * |---|---|
 * | Ctrl+휠, Ctrl+± | 글씨 크기 |
 * | Alt+←/→ | 모음집 이전/다음 노트 |
 * | Ctrl+N / L | 새 노트 / 목록 |
 * | Ctrl+W | 이 장만 숨기기 (모음집이면 창은 남고 다음 장으로) |
 * | Ctrl+Shift+W | 이 창 숨기기 (모음집 전체) |
 * | Ctrl+Shift+P | 모음집에서 꺼내기 (노트가 모음집에서 빠져 단독 창이 된다) |
 */
export function useNoteShortcuts({
  changeFont,
  navigate,
  popOut,
  flushBody,
  hideNote,
  hideWindow,
}: Handlers) {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      changeFont(e.deltaY < 0 ? 1 : -1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        changeFont(1);
      }
      if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        changeFont(-1);
      }
      if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        navigate(e.key === "ArrowRight" ? 1 : -1);
      }
      const k = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && k === "n") {
        e.preventDefault();
        api.createNote().catch(() => {});
      }
      if (e.ctrlKey && k === "w") {
        e.preventDefault();
        if (e.shiftKey) hideWindow();
        else hideNote();
      }
      if (e.ctrlKey && !e.shiftKey && k === "l") {
        e.preventDefault();
        api.openList().catch(() => {});
      }
      if (e.ctrlKey && e.shiftKey && k === "p") {
        e.preventDefault();
        popOut();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    // 다른 창으로 포커스가 넘어가면 편집 중이던 본문을 흘리지 않는다
    window.addEventListener("blur", flushBody);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", flushBody);
    };
  }, [changeFont, flushBody, hideNote, hideWindow, navigate, popOut]);
}
