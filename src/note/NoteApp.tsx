import { useCallback, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Editor } from "@tiptap/react";
import * as api from "../lib/api";
import { fontStack } from "../lib/noteUtils";
import Toolbar from "./Toolbar";
import { NavLeftIcon, NavRightIcon } from "./icons";
import FormatBar from "./FormatBar";
import RichEditor from "./RichEditor";
import { useDataRoot, useNoteDocument } from "./hooks/useNoteDocument";
import { useGroupNavigation } from "./hooks/useGroupNavigation";
import { useImageInsert } from "./hooks/useImageInsert";
import { useNoteShortcuts } from "./hooks/useNoteShortcuts";
import { useSaveGuard } from "./hooks/useSaveGuard";
import { useScrollHint } from "./hooks/useScrollHint";
import { useWindowSync } from "./hooks/useWindowSync";

/**
 * 노트 창 하나. 상태와 부수효과는 전부 `hooks/`가 갖고, 여기서는 배선과
 * 화면만 다룬다.
 *
 * 이 창이 표시하는 노트는 고정이 아니다 — 모음집 넘기기·팝아웃으로 바뀐다.
 */
export default function NoteApp({ noteId: initialNoteId }: { noteId: string }) {
  const { saveError, guard, retry } = useSaveGuard();
  const doc = useNoteDocument(initialNoteId, guard);
  const { noteId, note, setNote, slide, flushBody, onBodyChange, patchMeta, changeFont, switchTo } =
    doc;
  const base = useDataRoot();

  const { members, navigate, jumpTo, popOut } = useGroupNavigation({
    noteId,
    flushBody,
    switchTo,
    setNote,
  });
  const mergeHint = useWindowSync(noteId);
  useNoteShortcuts({ changeFont, navigate, popOut, flushBody });

  // 서식 바는 editor 상태를, 이미지 삽입은 ref를 쓴다 (리렌더 없이 최신 인스턴스)
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onEditor = useCallback((e: Editor | null) => {
    editorRef.current = e;
    setEditor(e);
  }, []);
  const { savePastedImage, pickImage } = useImageInsert({ noteId, editorRef, guard });
  const { contentRef, more } = useScrollHint(editor, note?.meta.font_size);

  if (!note || base === null) return null;
  const m = note.meta;
  const inGroup = members.length > 1;

  return (
    <div
      className={"note" + (mergeHint ? " merge-hint" : "")}
      data-color={m.color}
      style={{ fontSize: m.font_size, fontFamily: fontStack(m.font_family) }}
    >
      <Toolbar
        note={note}
        canPopOut={inGroup}
        onPopOut={popOut}
        onColor={(color) => patchMeta({ color })}
        onFont={(font_family) => patchMeta({ font_family })}
        onGroup={(name) =>
          guard("meta", () => api.saveMeta(noteId, { group: name ?? "" }).then(setNote))
        }
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
            title: "노트 삭제",
            kind: "warning",
            okLabel: "삭제",
            cancelLabel: "취소",
          });
          if (ok) guard("delete", () => api.deleteNote(noteId));
        }}
        onOpenList={() => api.openList()}
        onClose={() => {
          flushBody();
          getCurrentWindow().close();
        }}
      />
      {saveError && (
        <div className="save-error">
          저장 실패 — <button onClick={retry}>재시도</button>
        </div>
      )}
      {inGroup && (
        <>
          <button className="nav-arrow left" title="이전 노트 (Alt+←)" onClick={() => navigate(-1)}>
            <NavLeftIcon />
          </button>
          <button className="nav-arrow right" title="다음 노트 (Alt+→)" onClick={() => navigate(1)}>
            <NavRightIcon />
          </button>
        </>
      )}
      <div key={noteId} className={"content" + (slide ? ` slide-${slide}` : "")} ref={contentRef}>
        <RichEditor
          key={noteId}
          body={note.body}
          base={base}
          onChange={onBodyChange}
          onEditor={onEditor}
          onPasteFile={savePastedImage}
        />
        {more && (
          <div className="scroll-more" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path
                d="M3.5 6l4.5 4.5L12.5 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
      {inGroup && (
        <div className="group-dots" aria-hidden={false}>
          {members.map((id, i) => (
            <button
              key={id}
              className={id === noteId ? "active" : ""}
              title={`${i + 1} / ${members.length}`}
              onClick={() => {
                if (id !== noteId) jumpTo(id, i > members.indexOf(noteId) ? "next" : "prev");
              }}
            />
          ))}
        </div>
      )}
      <FormatBar editor={editor} onAddImage={pickImage} />
    </div>
  );
}
