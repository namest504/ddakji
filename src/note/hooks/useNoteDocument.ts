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
  // 외부 변경(CLI 등)으로 본문을 교체할 때 에디터를 다시 마운트시키는 카운터.
  // 에디터는 마운트 후 body 변경을 무시하므로 key에 이 값이 들어가야 한다 (#12)
  const [rev, setRev] = useState(0);
  // null = 이 창은 아직 본문을 모른다. 빈 문자열과 반드시 구별해야 한다 —
  // 섞으면 로드 전 플러시가 멀쩡한 파일을 빈 값으로 덮어쓴다 (#120)
  const bodyRef = useRef<string | null>(null);
  const saveTimer = useRef<number>();
  // 저장 안 된 편집이 있는 동안 외부 변경 리로드를 막는다 — 마지막 쓰기 승리
  const dirtyRef = useRef(false);
  const noteIdRef = useRef(initialNoteId);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);
  // 이벤트 핸들러(changeFont)가 최신 노트를 보되 리렌더는 유발하지 않도록
  const noteRef = useRef<Note | null>(null);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    api
      .listNotes()
      .then((all) => {
        const n = all.find((x) => x.meta.id === noteId) ?? null;
        // 저장 대상 ref를 여기서 채워야 한다 — 에디터는 초기 content를 받을 뿐
        // onUpdate를 발화시키지 않으므로, 이 대입이 없으면 첫 타이핑 전까지
        // ref가 비어 있다 (#120)
        if (n) bodyRef.current = n.body;
        setNote(n);
      })
      .finally(() => {
        // 창은 visible:false로 생성된다 — 내용을 그린 뒤 표시해 흰 화면 플래시 제거
        const win = getCurrentWindow();
        win
          .show()
          .then(() => win.setFocus())
          .catch(() => {});
      });
  }, [noteId]);

  // 본문은 에디터가 진실 — 저장 대상만 ref로 들고 있다가 디바운스해 기록한다
  const flushBody = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const body = bodyRef.current;
    // 본문을 모르는 창은 저장할 것도 없다. 로드가 끝나기 전의 플러시(포커스
    // 아웃 등)가 여기로 오는데, 그대로 쓰면 빈 값이 파일을 덮어쓴다 (#120)
    if (body === null) return;
    guard("body", () =>
      api.saveBody(noteId, body).then((n) => {
        dirtyRef.current = false;
        return n;
      }),
    );
  }, [guard, noteId]);

  const onBodyChange = useCallback(
    (body: string) => {
      bodyRef.current = body;
      dirtyRef.current = true;
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
    dirtyRef.current = false;
    setSlide(dir);
    setNote(n);
    setNoteId(n.meta.id);
  }, []);

  // 외부 변경 브리지 (#12): CLI 등이 이 노트를 바꾸면 백엔드가 note-updated를
  // 보낸다. 이 창에서 편집 중(dirty)이면 무시 — 우리 저장이 이긴다.
  useEffect(() => {
    let un: (() => void) | null = null;
    getCurrentWindow()
      .listen<Note>("note-updated", (e) => {
        const n = e.payload;
        if (n.meta.id !== noteIdRef.current) return;
        if (dirtyRef.current) return;
        bodyRef.current = n.body;
        setNote(n);
        setRev((r) => r + 1);
      })
      .then((f) => {
        un = f;
      })
      .catch(() => {});
    return () => {
      if (un) un();
    };
  }, []);

  // 백엔드가 이 창을 다른 노트로 전환시키는 경로 (#77 룰4 — 목록에서 모음집
  // 멤버를 열면 새 창 대신 모음집 창이 그 멤버로 전환된다)
  useEffect(() => {
    let un: (() => void) | null = null;
    getCurrentWindow()
      .listen<Note>("switch-note", (e) => switchTo(e.payload, "next"))
      .then((f) => {
        un = f;
      })
      .catch(() => {});
    return () => {
      if (un) un();
    };
  }, [switchTo]);

  return {
    noteId,
    note,
    rev,
    setNote,
    slide,
    flushBody,
    onBodyChange,
    patchMeta,
    changeFont,
    switchTo,
  };
}
