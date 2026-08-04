import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { clampFontSize } from "../lib/noteUtils";
import Toolbar from "./Toolbar";
import Editor from "./Editor";

export default function NoteApp({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [saveError, setSaveError] = useState(false);
  const bodyRef = useRef("");
  const saveTimer = useRef<number>();

  useEffect(() => {
    api.listNotes().then((all) => {
      const n = all.find((n) => n.meta.id === noteId) ?? null;
      if (n) bodyRef.current = n.body;
      setNote(n);
    });
  }, [noteId]);

  const flushBody = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    api.saveBody(noteId, bodyRef.current)
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true));
  }, [noteId]);

  const onBodyChange = useCallback((body: string) => {
    bodyRef.current = body;
    setNote((n) => (n ? { ...n, body } : n));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushBody, 500);
  }, [flushBody]);

  // 창 이동/리사이즈 → 위치 저장 (디바운스)
  useEffect(() => {
    const win = getCurrentWindow();
    let t: number;
    const save = async () => {
      const factor = await win.scaleFactor();
      const pos = (await win.outerPosition()).toLogical(factor);
      const size = (await win.innerSize()).toLogical(factor);
      api.saveMeta(noteId, { window: { x: pos.x, y: pos.y, w: size.width, h: size.height } });
    };
    const un1 = win.onMoved(() => { clearTimeout(t); t = window.setTimeout(save, 500); });
    const un2 = win.onResized(() => { clearTimeout(t); t = window.setTimeout(save, 500); });
    return () => { un1.then((f) => f()); un2.then((f) => f()); };
  }, [noteId]);

  // Ctrl+휠 / Ctrl+± 글씨 크기
  const changeFont = useCallback((delta: number) => {
    setNote((n) => {
      if (!n) return n;
      const font_size = clampFontSize(n.meta.font_size + delta);
      api.saveMeta(noteId, { font_size });
      return { ...n, meta: { ...n.meta, font_size } };
    });
  }, [noteId]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) { e.preventDefault(); changeFont(e.deltaY < 0 ? 1 : -1); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); changeFont(1); }
      if (e.ctrlKey && e.key === "-") { e.preventDefault(); changeFont(-1); }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", flushBody);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", flushBody);
    };
  }, [changeFont, flushBody]);

  if (!note) return null;
  const m = note.meta;

  const patchMeta = (patch: api.MetaPatch) => {
    api.saveMeta(noteId, patch);
    setNote({ ...note, meta: { ...m, ...patch } });
  };

  return (
    <div className="note" data-color={m.color} style={{ fontSize: m.font_size }}>
      <Toolbar
        note={note}
        onColor={(color) => patchMeta({ color })}
        onToggleViewer={() => patchMeta({ viewer_mode: !m.viewer_mode })}
        onPin={async () => {
          const v = !m.always_on_top;
          await getCurrentWindow().setAlwaysOnTop(v);
          patchMeta({ always_on_top: v });
        }}
        onFontDelta={changeFont}
        onNew={() => api.createNote()}
        onDelete={async () => {
          if (window.confirm("이 노트를 삭제할까요? 되돌릴 수 없습니다.")) {
            await api.deleteNote(noteId);
          }
        }}
        onOpenList={() => api.openList()}
      />
      {saveError && (
        <div className="save-error">
          저장 실패 — <button onClick={flushBody}>재시도</button>
        </div>
      )}
      {m.viewer_mode
        ? <div className="viewer-placeholder" onDoubleClick={() => patchMeta({ viewer_mode: false })}>뷰어는 다음 태스크에서</div>
        : <Editor noteId={noteId} value={note.body} onChange={onBodyChange} />}
    </div>
  );
}
