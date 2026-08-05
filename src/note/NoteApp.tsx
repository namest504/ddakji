import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Editor } from "@tiptap/react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { clampFontSize, fontStack, hasMoreBelow } from "../lib/noteUtils";
import Toolbar from "./Toolbar";
import FormatBar from "./FormatBar";
import RichEditor from "./RichEditor";

export default function NoteApp({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [base, setBase] = useState<string | null>(null); // 데이터 루트 (asset URL용)
  const [saveError, setSaveError] = useState(false);
  const bodyRef = useRef("");
  const loadedRef = useRef(false);
  const saveTimer = useRef<number>();
  const failedOp = useRef<{ key: string; run: () => void } | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onEditor = useCallback((e: Editor | null) => {
    editorRef.current = e;
    setEditor(e);
  }, []);

  const failWith = (key: string, run: () => void) => { failedOp.current = { key, run }; setSaveError(true); };
  const clearIfFailed = (key: string) => {
    if (failedOp.current?.key === key) { failedOp.current = null; setSaveError(false); }
  };

  useEffect(() => {
    loadedRef.current = false;
    api.dataRoot().then((r) => setBase(r.replace(/\\/g, "/"))).catch(() => setBase(""));
    api.listNotes().then((all) => {
      const n = all.find((n) => n.meta.id === noteId) ?? null;
      if (n) bodyRef.current = n.body;
      loadedRef.current = true;
      setNote(n);
    }).finally(() => {
      // 창은 visible:false로 생성된다 — 내용을 그린 뒤 표시해 흰 화면 플래시 제거
      const win = getCurrentWindow();
      win.show().then(() => win.setFocus()).catch(() => {});
    });
  }, [noteId]);

  const flushBody = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const run = () => api.saveBody(noteId, bodyRef.current)
      .then(() => clearIfFailed("body"))
      .catch(() => failWith("body", run));
    run();
  }, [noteId]);

  const onBodyChange = useCallback((body: string) => {
    bodyRef.current = body;
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
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", flushBody);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", flushBody);
    };
  }, [changeFont, flushBody]);

  // 이미지 저장 → 에디터에 상대경로로 삽입 (붙여넣기·드롭·서식바 공용)
  const insertImageRel = (rel: string) => {
    editorRef.current?.chain().focus().setImage({ src: rel }).run();
  };

  const savePastedImage = useCallback((file: File) => {
    const key = `image:${crypto.randomUUID()}`;
    const run = async () => {
      try {
        const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const bytes = new Uint8Array(await file.arrayBuffer());
        insertImageRel(await api.saveImage(noteId, ext, bytes));
        clearIfFailed(key);
      } catch {
        failWith(key, run);
      }
    };
    run();
  }, [noteId]);

  // 파일 드롭으로 이미지 삽입
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const fn = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type !== "drop" || !loadedRef.current) return;
        for (const path of e.payload.paths) {
          if (!/\.(png|jpe?g|gif|webp)$/i.test(path)) continue;
          const key = `image:${crypto.randomUUID()}`;
          const run = async () => {
            try {
              insertImageRel(await api.importImage(noteId, path));
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
  }, [noteId]);

  // 서식 바의 이미지 버튼 → 파일 선택 다이얼로그
  const pickImage = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: false,
      filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (typeof sel !== "string") return;
    const key = `image:${crypto.randomUUID()}`;
    const run = async () => {
      try {
        insertImageRel(await api.importImage(noteId, sel));
        clearIfFailed(key);
      } catch {
        failWith(key, run);
      }
    };
    run();
  }, [noteId]);

  // 스크롤 여지 표시: 스크롤·내용·크기 변화 시 하단 "더 있음" 힌트 갱신
  const contentRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const updateMore = useCallback(() => {
    const el = contentRef.current?.querySelector<HTMLElement>(".content-editor");
    setMore(el ? hasMoreBelow(el.scrollHeight, el.scrollTop, el.clientHeight) : false);
  }, []);
  useEffect(() => {
    const el = contentRef.current?.querySelector<HTMLElement>(".content-editor");
    if (!el) return;
    updateMore();
    el.addEventListener("scroll", updateMore);
    // 이미지 로드로 뒤늦게 길어지는 경우까지 잡는다 (load는 버블링하지 않으므로 캡처)
    el.addEventListener("load", updateMore, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateMore) : null;
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", updateMore);
      el.removeEventListener("load", updateMore, true);
      ro?.disconnect();
    };
  }, [editor, note?.meta.font_size, updateMore]);

  if (!note || base === null) return null;
  const m = note.meta;

  const patchMeta = (patch: api.MetaPatch) => {
    const run = () => api.saveMeta(noteId, patch)
      .then(() => clearIfFailed("meta"))
      .catch(() => failWith("meta", run));
    run();
    setNote((n) => (n ? { ...n, meta: { ...n.meta, ...patch } } : n));
  };

  return (
    <div className="note" data-color={m.color}
      style={{ fontSize: m.font_size, fontFamily: fontStack(m.font_family) }}>
      <Toolbar
        note={note}
        onColor={(color) => patchMeta({ color })}
        onFont={(font_family) => patchMeta({ font_family })}
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
        <RichEditor key={noteId} body={note.body} base={base}
          onChange={onBodyChange} onEditor={onEditor} onPasteFile={savePastedImage} />
        {more && (
          <div className="scroll-more" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      <FormatBar editor={editor} onAddImage={pickImage} />
    </div>
  );
}
