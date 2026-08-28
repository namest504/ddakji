import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useT } from "../lib/i18n";
import { buildHtmlDoc, collectAssetRefs, embedAssets, exportBodyHtml } from "../lib/exportNote";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Editor } from "@tiptap/react";
import * as api from "../lib/api";
import { fontStack } from "../lib/noteUtils";
import ContextMenu, { type CtxEntry } from "./ContextMenu";
import Toolbar from "./Toolbar";
import { NavLeftIcon, NavRightIcon } from "./icons";
import FormatBar from "./FormatBar";
import NoteBack from "./NoteBack";
import RichEditor from "./RichEditor";
import { useDataRoot, useNoteDocument } from "./hooks/useNoteDocument";
import { useGroupNavigation, useHide } from "./hooks/useGroupNavigation";
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
  const t = useT();
  const lang = useLang();
  const { saveError, guard, retry } = useSaveGuard();
  const doc = useNoteDocument(initialNoteId, guard);
  const {
    noteId,
    note,
    rev,
    setNote,
    slide,
    flushBody,
    mountBody,
    onBodyChange,
    patchMeta,
    changeFont,
    switchTo,
  } = doc;
  const base = useDataRoot();

  const { members, navigate, jumpTo, popOut } = useGroupNavigation({
    noteId,
    flushBody,
    switchTo,
    setNote,
  });
  const { mergeTarget, merged, dismissMerged } = useWindowSync(noteId);
  const { hideNote, hideWindow } = useHide({ flushBody, switchTo });
  useNoteShortcuts({ changeFont, navigate, popOut, flushBody, hideNote, hideWindow });

  // 서식 바는 editor 상태를, 이미지 삽입은 ref를 쓴다 (리렌더 없이 최신 인스턴스)
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onEditor = useCallback((e: Editor | null) => {
    editorRef.current = e;
    setEditor(e);
  }, []);
  const { savePastedImage, pickImage } = useImageInsert({ noteId, editorRef, guard });
  const { contentRef, more } = useScrollHint(editor, note?.meta.font_size);

  // 뒷면 전환 (딱지 시안): null = 아직 안 뒤집음, "front"는 돌아온 직후(복귀 슬라이드용)
  const [flip, setFlip] = useState<"back" | "front" | null>(null);
  // 이 창이 다른 장으로 넘어가면 앞면으로 돌아온다 — 삭제·넘기기로 넘겨받은 장의
  // 뒷면부터 보여 줄 이유가 없고, 남의 정보를 뒤집힌 채로 마주치면 오해를 부른다.
  // 효과가 아니라 렌더 중에 맞춘다(React의 "prop이 바뀔 때 state 조정" 패턴) —
  // 효과로 하면 뒷면이 한 프레임 비쳤다가 사라진다.
  const [flipFor, setFlipFor] = useState(noteId);
  // 우클릭 메뉴 (#172) — null이면 닫힘. 장이 넘어가면 메뉴도 닫는다.
  // 항목은 **여는 순간**(이벤트 핸들러)에 만든다 — 렌더 중에 만들면 에디터
  // ref를 렌더에서 읽게 된다 (react-hooks/refs).
  const [menu, setMenu] = useState<{ x: number; y: number; entries: CtxEntry[] } | null>(null);
  if (flipFor !== noteId) {
    setFlipFor(noteId);
    setFlip(null);
    setMenu(null);
  }
  const flipped = flip === "back";
  const toggleFlip = () => {
    if (!flipped) {
      flushBody(); // 뒷면을 여는 시점의 본문을 저장한다
      // 에디터는 덮개 밑에 산 채로 남는다 — 포커스만 거둬 덮인 채 타이핑되는
      // 일을 막는다 (#135: 리마운트하면 마크다운이 못 담는 상태가 접힌다)
      editorRef.current?.commands.blur();
    }
    setFlip(flipped ? "front" : "back");
  };

  // 메뉴 닫기: 바깥 누름·Esc·창 blur — 열림 상태의 주인은 여기 하나다 (#172)
  useEffect(() => {
    if (!menu) return;
    const onDown = (ev: PointerEvent) => {
      if (!(ev.target as Element | null)?.closest?.(".ctx-menu")) setMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenu(null);
    };
    const onBlur = () => setMenu(null);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [menu]);

  // 자석 기울임(#171) 동안 body 배경을 노트 액센트색으로 맞춘다 — 내용이
  // 기울며 드러나는 모서리가 "같은 색종이의 어두운 면(뒷면)"으로 보여, 종이가
  // 살짝 들려 기울어진 그림이 된다. (OS 창은 회전할 수 없다 — 시안→앱 번역.)
  const rootRef = useRef<HTMLDivElement>(null);
  const magnet = mergeTarget !== null;
  useEffect(() => {
    const el = rootRef.current;
    if (!magnet || !el) return;
    const prev = document.body.style.background;
    document.body.style.background = getComputedStyle(el).getPropertyValue("--accent");
    return () => {
      document.body.style.background = prev;
    };
  }, [magnet]);

  if (!note || base === null) return null;
  const m = note.meta;
  const inGroup = members.length > 1;

  // ── 우클릭 메뉴 (#172): 본문은 편집 우선, 타이틀바는 창 단위 기능 ──
  // 이 빌더들은 onContextMenu(이벤트 핸들러)에서만 부른다.
  const editorEntries = (): CtxEntry[] => {
    const ed = editorRef.current;
    const hasSelection = !!ed && !ed.state.selection.empty;
    return [
      {
        kind: "item",
        label: t("ctxCut"),
        disabled: !hasSelection,
        onClick: () => document.execCommand("cut"),
      },
      {
        kind: "item",
        label: t("ctxCopy"),
        disabled: !hasSelection,
        onClick: () => document.execCommand("copy"),
      },
      {
        kind: "item",
        label: t("ctxPaste"),
        onClick: async () => {
          const text = await navigator.clipboard.readText().catch(() => "");
          if (text) editorRef.current?.chain().focus().insertContent(text).run();
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: t("ctxBold"),
        onClick: () => editorRef.current?.chain().focus().toggleBold().run(),
      },
      {
        kind: "item",
        label: t("ctxTask"),
        onClick: () => editorRef.current?.chain().focus().toggleTaskList().run(),
      },
      { kind: "sep" },
      { kind: "item", label: t("ctxArrange"), onClick: () => api.arrangeWindows() },
      { kind: "item", label: t("ctxFlip"), onClick: toggleFlip },
    ];
  };
  const windowEntries = (): CtxEntry[] => [
    { kind: "item", label: t("newNoteShort"), onClick: () => api.createNote() },
    { kind: "swatches", current: m.color, onPick: (color) => patchMeta({ color }) },
    {
      kind: "item",
      label: t("alwaysOnTop"),
      checked: m.always_on_top,
      onClick: async () => {
        const v = !m.always_on_top;
        await getCurrentWindow().setAlwaysOnTop(v);
        patchMeta({ always_on_top: v });
      },
    },
    { kind: "sep" },
    { kind: "item", label: t("ctxArrange"), onClick: () => api.arrangeWindows() },
    { kind: "item", label: t("ctxList"), onClick: () => api.openList() },
    ...(inGroup ? [{ kind: "item", label: t("ctxHide"), onClick: hideNote } as CtxEntry] : []),
    { kind: "item", label: flipped ? t("flipToFront") : t("ctxFlip"), onClick: toggleFlip },
    { kind: "sep" },
    { kind: "item", label: t("ctxClose"), onClick: hideWindow },
  ];

  // ── 공유 (#149): 렌더는 JSON에서(원본 상대경로), 이미지는 data URI로 내장 ──
  const embeddedHtml = async () => {
    const ed = editorRef.current;
    if (!ed) return null;
    const html = exportBodyHtml(ed.getJSON());
    const refs = collectAssetRefs(html, noteId);
    const pairs = await Promise.all(
      refs.map(async (r) => [r, await api.assetDataUri(noteId, r)] as const),
    );
    return embedAssets(html, new Map(pairs));
  };

  const exportName = () => (note?.meta.title?.trim() || noteId).replace(/[\\/:*?"<>|]/g, "-");

  const copyFormatted = async () => {
    const html = await embeddedHtml();
    if (html === null) return;
    const { writeHtml } = await import("@tauri-apps/plugin-clipboard-manager");
    // 서식을 못 받는 앱(터미널 등)은 평문 마크다운을 받는다
    await writeHtml(html, mountBody() ?? note?.body ?? "");
  };

  const exportMd = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dest = await save({ defaultPath: `${exportName()}.md` });
    if (!dest) return;
    guard("export", () => api.exportNoteMd(noteId, dest));
  };

  const exportHtml = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dest = await save({ defaultPath: `${exportName()}.html` });
    if (!dest) return;
    guard("export", async () => {
      const html = await embeddedHtml();
      if (html === null) return;
      await api.writeTextFile(dest, buildHtmlDoc(exportName(), lang, html));
    });
  };

  const onDelete = async () => {
    // window.confirm은 WebView2가 웹뷰 영역 안에 그려서 작은 노트 창에서는
    // 버튼이 잘려 진행이 불가능하다 (#11) — OS 네이티브 다이얼로그를 쓴다.
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const ok = await ask(t("deleteToTrash"), {
      title: t("deleteNoteTitle"),
      kind: "warning",
      okLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (ok) guard("delete", () => api.deleteNote(noteId));
  };

  return (
    <div
      ref={rootRef}
      className={"note" + (magnet ? " merge-magnet" : "")}
      data-color={m.color}
      style={{ fontSize: m.font_size, fontFamily: fontStack(m.font_family) }}
      onContextMenu={(e) => {
        // WebView2 기본 메뉴 대신 앱 메뉴 (#172). 상단 40px(타이틀바 띠)와
        // 뒷면은 창 단위 메뉴, 나머지는 편집 메뉴.
        e.preventDefault();
        const entries = flipped || e.clientY <= 40 ? windowEntries() : editorEntries();
        setMenu({ x: e.clientX, y: e.clientY, entries });
      }}
    >
      <Toolbar
        note={note}
        canPopOut={inGroup}
        onPopOut={popOut}
        onColor={(color) => patchMeta({ color })}
        onFont={(font_family) => patchMeta({ font_family })}
        onPin={async () => {
          const v = !m.always_on_top;
          await getCurrentWindow().setAlwaysOnTop(v);
          patchMeta({ always_on_top: v });
        }}
        onFontDelta={changeFont}
        onNew={() => api.createNote()}
        onOpenList={() => api.openList()}
        canHideNote={inGroup}
        onHideNote={hideNote}
        onClose={hideWindow}
      />
      {saveError && (
        <div className="save-error">
          {t("saveFailed")}
          <button onClick={retry}>{t("retry")}</button>
        </div>
      )}
      {merged && (
        <div className="merge-undo">
          {t("mergedIntoGroup")}
          <span className="merge-undo-actions">
            <button
              onClick={() => {
                dismissMerged();
                api.undoMerge().catch(() => {});
              }}
            >
              {t("undo")}
            </button>
            {/* 자동 소멸이 실패해도 탈출구는 남는다 — 배너는 툴바 위 레이어다 */}
            <button
              aria-label={t("dismissNotice")}
              className="merge-undo-close"
              onClick={dismissMerged}
            >
              ✕
            </button>
          </span>
        </div>
      )}
      {inGroup && !flipped && (
        <>
          <button className="nav-arrow left" title={t("prevNote")} onClick={() => navigate(-1)}>
            <NavLeftIcon />
          </button>
          <button className="nav-arrow right" title={t("nextNote")} onClick={() => navigate(1)}>
            <NavRightIcon />
          </button>
        </>
      )}
      {flipped && (
        <NoteBack
          note={note}
          onReveal={() => api.revealNote(noteId)}
          onDelete={onDelete}
          onCopyFormatted={copyFormatted}
          onExportMd={exportMd}
          onExportHtml={exportHtml}
        />
      )}
      <div
        key={noteId}
        className={"content" + (slide ? ` slide-${slide}` : flip === "front" ? " slide-prev" : "")}
        ref={contentRef}
      >
        <RichEditor
          key={`${noteId}#${rev}`}
          body={mountBody() ?? note.body}
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
      {inGroup && !flipped && (
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
      {/* 병합 예고 칩 (#171 자석) — 어느 노트에 합쳐질지 이름으로 보여 준다 */}
      {mergeTarget !== null && (
        <div className="merge-chip">
          {mergeTarget ? t("mergeChip", { title: mergeTarget }) : t("mergeChipUntitled")}
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} entries={menu.entries} />
      )}
      {!flipped && <FormatBar editor={editor} onAddImage={pickImage} />}
      {/* 오른쪽 아래 빗금 모서리 = 뒷면 전환 (앞뒷면 동일 위치) */}
      <button
        className="flip-grip"
        title={flipped ? t("flipToFront") : t("flipToBack")}
        aria-label={flipped ? t("flipToFrontAria") : t("flipToBackAria")}
        onClick={toggleFlip}
      />
    </div>
  );
}
