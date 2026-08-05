import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { clampFontSize, hasMoreBelow, initialViewerMode } from "../lib/noteUtils";
import Toolbar from "./Toolbar";
import Editor from "./Editor";
import Viewer from "./Viewer";

export default function NoteApp({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [saveError, setSaveError] = useState(false);
  // 표시 모드는 세션 상태다. 본문이 있으면 뷰어(렌더된 마크다운)가 평상시 모습이고,
  // 편집은 더블클릭으로 진입해 포커스를 잃으면 뷰어로 돌아온다 (#9).
  const [viewerMode, setViewerModeState] = useState(false);
  const viewerModeRef = useRef(false);
  const setViewerMode = useCallback((v: boolean) => {
    viewerModeRef.current = v;
    setViewerModeState(v);
  }, []);
  const bodyRef = useRef("");
  const loadedRef = useRef(false);
  const saveTimer = useRef<number>();
  const failedOp = useRef<{ key: string; run: () => void } | null>(null);

  const failWith = (key: string, run: () => void) => { failedOp.current = { key, run }; setSaveError(true); };
  const clearIfFailed = (key: string) => {
    if (failedOp.current?.key === key) { failedOp.current = null; setSaveError(false); }
  };

  useEffect(() => {
    loadedRef.current = false;
    api.listNotes().then((all) => {
      const n = all.find((n) => n.meta.id === noteId) ?? null;
      if (n) {
        bodyRef.current = n.body;
        setViewerMode(initialViewerMode(n.body));
      }
      loadedRef.current = true;
      setNote(n);
    });
  }, [noteId, setViewerMode]);

  const flushBody = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const run = () => api.saveBody(noteId, bodyRef.current)
      .then(() => clearIfFailed("body"))
      .catch(() => failWith("body", run));
    run();
  }, [noteId]);

  const onBodyChange = useCallback((body: string) => {
    bodyRef.current = body;
    setNote((n) => (n ? { ...n, body } : n));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushBody, 500);
  }, [flushBody]);

  // Cleanup pending timers on unmount
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

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
    return () => { clearTimeout(t); un1.then((f) => f()); un2.then((f) => f()); };
  }, [noteId]);

  // Ctrl+휠 / Ctrl+± 글씨 크기
  const changeFont = useCallback((delta: number) => {
    setNote((n) => {
      if (!n) return n;
      const font_size = clampFontSize(n.meta.font_size + delta);
      const run = () => api.saveMeta(noteId, { font_size })
        .then(() => clearIfFailed("meta"))
        .catch(() => failWith("meta", run));
      run();
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
    const onBlur = () => {
      flushBody();
      // 다른 곳을 보다가 돌아왔을 때 스티키 노트는 렌더된 모습이어야 한다 (#9)
      if (!viewerModeRef.current && bodyRef.current.trim()) setViewerMode(true);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [changeFont, flushBody, setViewerMode]);

  // 이미지 붙여넣기: 저장은 비동기이므로, 완료 시점의 "현재" 본문(bodyRef.current)에
  // 삽입한다. 붙여넣기 시점의 본문 스냅샷을 캡처해두고, 저장이 끝난 시점에 본문이
  // 그때와 완전히 동일할 때만 캡처해둔 오프셋에 끼워 넣는다 — 그 사이 본문이 조금이라도
  // 바뀌었다면(오프셋 앞쪽 편집 포함) 위치가 더 이상 유효하지 않으므로 끝에 덧붙인다.
  // 실패 키는 동시 붙여넣기/드롭이 서로의 배너를 지우지 않도록 매 작업마다 고유하게 발급한다.
  const pasteImage = useCallback((file: File, selStart: number, selEnd: number) => {
    const snapshot = bodyRef.current;
    const key = `image:${crypto.randomUUID()}`;
    const run = async () => {
      try {
        const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const rel = await api.saveImage(noteId, ext, bytes);
        const md = `![](${rel})`;
        const body = bodyRef.current;
        const next = body === snapshot
          ? body.slice(0, selStart) + md + body.slice(selEnd)
          : body + `\n${md}`;
        onBodyChange(next);
        clearIfFailed(key);
      } catch {
        failWith(key, run);
      }
    };
    run();
  }, [noteId, onBodyChange]);

  // 파일 드롭으로 이미지 삽입
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const fn = await getCurrentWebview().onDragDropEvent((e) => {
        // 초기 노트 로드가 끝나기 전 드롭이 들어오면 bodyRef.current가 아직 ""이라
        // 그대로 삽입/저장 경로를 타면 실제 본문을 덮어쓸 수 있다 — 로드 완료까지 무시.
        if (e.payload.type !== "drop" || !loadedRef.current) return;
        for (const path of e.payload.paths) {
          if (!/\.(png|jpe?g|gif|webp)$/i.test(path)) continue;
          const key = `image:${crypto.randomUUID()}`;
          const run = async () => {
            try {
              const rel = await api.importImage(noteId, path);
              onBodyChange(bodyRef.current + `\n![](${rel})`);
              clearIfFailed(key);
            } catch {
              failWith(key, run);
            }
          };
          run();
        }
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [noteId, onBodyChange]);

  // 스크롤 여지 표시(#스크롤바 숨김): 스크롤·내용·크기 변화 시 하단 "더 있음" 힌트 갱신
  const contentRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const updateMore = useCallback(() => {
    const el = contentRef.current?.querySelector<HTMLElement>(".editor, .viewer");
    setMore(el ? hasMoreBelow(el.scrollHeight, el.scrollTop, el.clientHeight) : false);
  }, []);
  useEffect(() => {
    const el = contentRef.current?.querySelector<HTMLElement>(".editor, .viewer");
    if (!el) return;
    updateMore();
    // 이미지 로드로 뒤늦게 길어지는 경우까지 잡는다 (load는 버블링하지 않으므로 캡처)
    el.addEventListener("load", updateMore, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateMore) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("load", updateMore, true);
      ro?.disconnect();
    };
  }, [viewerMode, note?.body, note?.meta.font_size, updateMore]);

  if (!note) return null;
  const m = note.meta;

  const patchMeta = (patch: api.MetaPatch) => {
    const run = () => api.saveMeta(noteId, patch)
      .then(() => clearIfFailed("meta"))
      .catch(() => failWith("meta", run));
    run();
    setNote((n) => (n ? { ...n, meta: { ...n.meta, ...patch } } : n));
  };

  return (
    <div className="note" data-color={m.color} style={{ fontSize: m.font_size }}>
      <Toolbar
        note={note}
        viewerMode={viewerMode}
        onColor={(color) => patchMeta({ color })}
        onToggleViewer={() => setViewerMode(!viewerMode)}
        onPin={async () => {
          const v = !m.always_on_top;
          await getCurrentWindow().setAlwaysOnTop(v);
          patchMeta({ always_on_top: v });
        }}
        onFontDelta={changeFont}
        onNew={() => api.createNote()}
        onDelete={async () => {
          // window.confirm은 WebView2가 웹뷰 영역 안에 그려서 작은 노트 창에서는
          // 버튼이 잘려 진행이 불가능하다 (#11) — OS 네이티브 다이얼로그를 쓴다.
          const { ask } = await import("@tauri-apps/plugin-dialog");
          const ok = await ask("이 노트를 삭제할까요? 되돌릴 수 없습니다.", {
            title: "노트 삭제", kind: "warning", okLabel: "삭제", cancelLabel: "취소",
          });
          if (ok) {
            const run = async () => {
              await api.deleteNote(noteId)
                .catch(() => failWith("delete", run));
            };
            await run();
          }
        }}
        onOpenList={() => api.openList()}
      />
      {saveError && (
        <div className="save-error">
          저장 실패 — <button onClick={() => failedOp.current?.run()}>재시도</button>
        </div>
      )}
      <div className="content" ref={contentRef}>
        {viewerMode
          ? <Viewer body={note.body} onEdit={() => setViewerMode(false)} onScroll={updateMore} />
          : <Editor noteId={noteId} value={note.body} onChange={onBodyChange} onPasteImage={pasteImage} onScroll={updateMore} />}
        {more && (
          <div className="scroll-more" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
