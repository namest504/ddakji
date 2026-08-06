import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Editor } from "@tiptap/react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { clampFontSize, fontStack, hasMoreBelow } from "../lib/noteUtils";
import Toolbar from "./Toolbar";
import { NavLeftIcon, NavRightIcon } from "./icons";
import FormatBar from "./FormatBar";
import RichEditor from "./RichEditor";

export default function NoteApp({ noteId: initialNoteId }: { noteId: string }) {
  // 그룹 넘기기(#25)로 창이 표시하는 노트가 바뀔 수 있다 — 상태로 승격
  const [noteId, setNoteId] = useState(initialNoteId);
  const [note, setNote] = useState<Note | null>(null);
  const [members, setMembers] = useState<string[]>([]); // 그룹 순서대로의 노트 id (#25 G2)
  const [mergeHint, setMergeHint] = useState(false); // 드래그 중 "놓으면 합쳐짐" 프리뷰
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
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
  // 노트 파일이 밖에서 삭제됐다(NOTE_NOT_FOUND) — 좀비 창을 남기지 않고 닫는다
  const closeIfGone = (e: unknown) => {
    if (e === "NOTE_NOT_FOUND") {
      getCurrentWindow().destroy().catch(() => {});
      return true;
    }
    return false;
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
      .catch((e) => { if (!closeIfGone(e)) failWith("body", run); });
    run();
  }, [noteId]);

  const onBodyChange = useCallback((body: string) => {
    bodyRef.current = body;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushBody, 500);
  }, [flushBody]);

  // 그룹 멤버 목록 — 그룹 변경 이벤트(다른 창·병합 포함) 시 메타와 함께 갱신
  useEffect(() => {
    let un: (() => void) | null = null;
    const refresh = () => {
      api.listNotes().then((all) => {
        const n = all.find((x) => x.meta.id === noteId);
        if (!n) return;
        setNote((prev) => (prev ? { ...prev, meta: n.meta } : prev));
        if (n.meta.group) api.groupMembers(noteId).then(setMembers).catch(() => {});
        else setMembers([]);
      }).catch(() => {});
    };
    refresh();
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen("groups-changed", refresh).then((f) => { un = f; })
    ).catch(() => {});
    return () => { if (un) un(); };
  }, [noteId]);

  // Cleanup pending timers on unmount
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  // 창 이동/리사이즈 → 위치 저장 (디바운스)
  useEffect(() => {
    const win = getCurrentWindow();
    let t: number;
    let lastPos: { x: number; y: number } | null = null;
    let draggedFar = false; // 30px+ 실제 드래그가 있었을 때만 병합 검사 (겹쳐만 있어도 흡수되던 버그)
    const save = async () => {
      const factor = await win.scaleFactor();
      const pos = (await win.outerPosition()).toLogical(factor);
      const size = (await win.innerSize()).toLogical(factor);
      api.saveMeta(noteId, { window: { x: pos.x, y: pos.y, w: size.width, h: size.height } })
        .catch((e) => { closeIfGone(e); });
      if (draggedFar) {
        draggedFar = false;
        // 다른 노트 위에 60%+ 겹치게 "드래그해서" 놓였을 때만 합치기 (#25 G4)
        api.checkMerge().then((merged) => {
          if (!merged) setMergeHint(false);
        }).catch(() => {});
      }
    };
    let lastPreview = 0;
    let previewClear: number | undefined;
    const un1 = win.onMoved(({ payload }) => {
      if (lastPos && Math.abs(payload.x - lastPos.x) + Math.abs(payload.y - lastPos.y) > 30) {
        draggedFar = true;
      }
      lastPos = { x: payload.x, y: payload.y };
      // 드래그 중 흡수 예고: 겹침이면 빨려드는 프리뷰, 벗어나거나 멈추면 해제
      const nowT = Date.now();
      if (nowT - lastPreview > 100) {
        lastPreview = nowT;
        api.mergePreview().then(setMergeHint).catch(() => {});
      }
      window.clearTimeout(previewClear);
      previewClear = window.setTimeout(() => setMergeHint(false), 600);
      clearTimeout(t); t = window.setTimeout(save, 500);
    });
    const un2 = win.onResized(() => { clearTimeout(t); t = window.setTimeout(save, 500); });
    // Alt-Tab 썸네일용 "최근 본 노트" 추적
    const un3 = win.onFocusChanged(({ payload }) => {
      if (payload) api.setLastViewed(noteId).catch(() => {});
    });
    return () => { clearTimeout(t); un1.then((f) => f()); un2.then((f) => f()); un3.then((f) => f()); };
  }, [noteId]);

  // Ctrl+휠 / Ctrl+± 글씨 크기
  const changeFont = useCallback((delta: number) => {
    setNote((n) => {
      if (!n) return n;
      const font_size = clampFontSize(n.meta.font_size + delta);
      const run = () => api.saveMeta(noteId, { font_size })
        .then(() => clearIfFailed("meta"))
        .catch((e) => { if (!closeIfGone(e)) failWith("meta", run); });
      run();
      return { ...n, meta: { ...n.meta, font_size } };
    });
  }, [noteId]);

  const navigate = useCallback((dir: 1 | -1) => {
    flushBody();
    setSlide(dir === 1 ? "next" : "prev");
    api.navGroup(dir).then((n) => { if (n) setNoteId(n.meta.id); }).catch(() => {});
  }, [flushBody]);

  const popOut = useCallback(() => {
    flushBody();
    api.popOut().catch(() => {});
  }, [flushBody]);

  const jumpTo = useCallback((id: string, dirHint: "next" | "prev") => {
    flushBody();
    setSlide(dirHint);
    api.navTo(id).then((n) => { if (n) setNoteId(n.meta.id); }).catch(() => {});
  }, [flushBody]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) { e.preventDefault(); changeFont(e.deltaY < 0 ? 1 : -1); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); changeFont(1); }
      if (e.ctrlKey && e.key === "-") { e.preventDefault(); changeFont(-1); }
      // 그룹 내 이전/다음 노트 (#25) — 이미 열린 노트면 그 창으로 포커스 이동
      if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        navigate(e.key === "ArrowRight" ? 1 : -1);
      }
      const k = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && k === "n") { e.preventDefault(); api.createNote().catch(() => {}); }
      if (e.ctrlKey && !e.shiftKey && k === "w") { e.preventDefault(); flushBody(); getCurrentWindow().close(); }
      if (e.ctrlKey && !e.shiftKey && k === "l") { e.preventDefault(); api.openList().catch(() => {}); }
      if (e.ctrlKey && e.shiftKey && k === "p") { e.preventDefault(); popOut(); }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", flushBody);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", flushBody);
    };
  }, [changeFont, flushBody, navigate, popOut]);

  // 이미지 저장 → 에디터에 상대경로로 삽입 (붙여넣기·드롭·서식바 공용).
  // pos가 있으면 그 위치(드롭 지점)에, 없으면 현재 커서에 넣는다.
  const insertImageRel = (rel: string, pos?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    if (pos !== undefined) {
      ed.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: rel } }).run();
    } else {
      ed.chain().focus().setImage({ src: rel }).run();
    }
  };

  const savePastedImage = useCallback((file: File, pos?: number) => {
    const key = `image:${crypto.randomUUID()}`;
    const run = async () => {
      try {
        const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const bytes = new Uint8Array(await file.arrayBuffer());
        insertImageRel(await api.saveImage(noteId, ext, bytes), pos);
        clearIfFailed(key);
      } catch {
        failWith(key, run);
      }
    };
    run();
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
      .catch((e) => { if (!closeIfGone(e)) failWith("meta", run); });
    run();
    setNote((n) => (n ? { ...n, meta: { ...n.meta, ...patch } } : n));
  };

  return (
    <div className={"note" + (mergeHint ? " merge-hint" : "")} data-color={m.color}
      style={{ fontSize: m.font_size, fontFamily: fontStack(m.font_family) }}>
      <Toolbar
        note={note}
        canPopOut={members.length > 1}
        onPopOut={popOut}
        onColor={(color) => patchMeta({ color })}
        onFont={(font_family) => patchMeta({ font_family })}
        onGroup={(name) => {
          const run = () => api.saveMeta(noteId, { group: name ?? "" })
            .then((n) => { setNote(n); clearIfFailed("meta"); })
            .catch((e) => { if (!closeIfGone(e)) failWith("meta", run); });
          run();
        }}
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
        onClose={() => { flushBody(); getCurrentWindow().close(); }}
      />
      {saveError && (
        <div className="save-error">
          저장 실패 — <button onClick={() => failedOp.current?.run()}>재시도</button>
        </div>
      )}
      {members.length > 1 && (
        <>
          <button className="nav-arrow left" title="이전 노트 (Alt+←)"
            onClick={() => navigate(-1)}><NavLeftIcon /></button>
          <button className="nav-arrow right" title="다음 노트 (Alt+→)"
            onClick={() => navigate(1)}><NavRightIcon /></button>
        </>
      )}
      <div key={noteId} className={"content" + (slide ? ` slide-${slide}` : "")} ref={contentRef}>
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
      {members.length > 1 && (
        <div className="group-dots" aria-hidden={false}>
          {members.map((id, i) => (
            <button key={id} className={id === noteId ? "active" : ""}
              title={`${i + 1} / ${members.length}`}
              onClick={() => { if (id !== noteId) jumpTo(id, i > members.indexOf(noteId) ? "next" : "prev"); }} />
          ))}
        </div>
      )}
      <FormatBar editor={editor} onAddImage={pickImage} />
    </div>
  );
}
