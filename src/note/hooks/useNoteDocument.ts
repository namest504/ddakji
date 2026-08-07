import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "../../lib/api";
import type { Note } from "../../lib/api";
import { clampFontSize } from "../../lib/noteUtils";
import type { SaveGuard } from "./useSaveGuard";

/** 데이터 루트 — 에디터가 assets/ 상대경로를 asset URL로 바꿀 때 쓴다 */
export function useDataRoot(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    api
      .dataRoot()
      .then((r) => setBase(r.replace(/\\/g, "/")))
      .catch(() => setBase(""));
  }, []);
  return base;
}

/**
 * 이 창이 편집 중인 노트 문서 — 로드, 본문 자동 저장, 메타 갱신, 노트 전환.
 *
 * 창이 표시하는 노트는 고정이 아니다: 그룹 넘기기·팝아웃으로 바뀐다(#25, #74).
 * 그래서 noteId도 상태이며, 전환은 반드시 [`switchTo`]를 거쳐야 한다.
 */
export function useNoteDocument(initialNoteId: string, guard: SaveGuard) {
  const [noteId, setNoteId] = useState(initialNoteId);
  const [note, setNote] = useState<Note | null>(null);
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const bodyRef = useRef("");
  const saveTimer = useRef<number>();
  // 이벤트 핸들러(changeFont)가 최신 노트를 보되 리렌더는 유발하지 않도록
  const noteRef = useRef<Note | null>(null);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    api
      .listNotes()
      .then((all) => setNote(all.find((n) => n.meta.id === noteId) ?? null))
      .finally(() => {
        // 창은 visible:false로 생성된다 — 내용을 그린 뒤 표시해 흰 화면 플래시 제거
        const win = getCurrentWindow();
        win.show().then(() => win.setFocus()).catch(() => {});
      });
  }, [noteId]);

  // 본문은 에디터가 진실 — 저장 대상만 ref로 들고 있다가 디바운스해 기록한다
  const flushBody = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    guard("body", () => api.saveBody(noteId, bodyRef.current));
  }, [guard, noteId]);

  const onBodyChange = useCallback(
    (body: string) => {
      bodyRef.current = body;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushBody, 500);
    },
    [flushBody],
  );

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const patchMeta = useCallback(
    (patch: api.MetaPatch) => {
      guard("meta", () => api.saveMeta(noteId, patch));
      setNote((n) => (n ? { ...n, meta: { ...n.meta, ...patch } } : n));
    },
    [guard, noteId],
  );

  const changeFont = useCallback(
    (delta: number) => {
      const cur = noteRef.current;
      if (!cur) return;
      patchMeta({ font_size: clampFontSize(cur.meta.font_size + delta) });
    },
    [patchMeta],
  );

  /**
   * 창이 표시하는 노트를 바꾼다. note와 noteId를 한 커밋에 함께 갱신해야 한다 —
   * noteId만 먼저 바꾸면 에디터(key=noteId)가 **이전** 본문으로 리마운트되고,
   * RichEditor는 마운트 후 body 변경을 무시하므로 이전 메모가 계속 보인다 (#74).
   */
  const switchTo = useCallback((n: Note, dir: "next" | "prev") => {
    bodyRef.current = n.body;
    setSlide(dir);
    setNote(n);
    setNoteId(n.meta.id);
  }, []);

  return {
    noteId,
    note,
    setNote,
    slide,
    flushBody,
    onBodyChange,
    patchMeta,
    changeFont,
    switchTo,
  };
}
