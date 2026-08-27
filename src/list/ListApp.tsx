import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import { useUpdater } from "./useUpdater";
import { useLang, useT } from "../lib/i18n";
import type { Note } from "../lib/api";
import { filterNotes, noteTitle, relativeTime } from "../lib/noteUtils";
import { CheckboxIcon } from "../note/icons";
import {
  GearIcon,
  ImportIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UpdateIcon,
} from "../note/icons";
import DetailView from "./DetailView";
import SettingsView from "./SettingsView";
import TrashView from "./TrashView";

export default function ListApp() {
  const t = useT();
  const lang = useLang();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "settings" | "trash">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  // 모음집 이름 인라인 편집 (#139) — 어느 그룹을, 무슨 값으로, 실패 사유는
  const [renaming, setRenaming] = useState<{ group: string; value: string; error?: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const updater = useUpdater();

  const reload = useCallback(() => {
    api.listNotes().then(setNotes);
  }, []);
  useEffect(() => {
    reload();
    // 창은 visible:false로 생성된다 — 첫 렌더 후 표시 (흰 화면 플래시 제거)
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win
        .show()
        .then(() => win.setFocus())
        .catch(() => {});
    });
    const t = setInterval(reload, 2000); // 단순 폴링 (v1)
    return () => clearInterval(t);
  }, [reload]);

  const remove = async (id: string) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const ok = await ask(t("deleteToTrash"), {
      title: t("deleteNoteTitle"),
      kind: "warning",
      okLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (ok) api.deleteNote(id).then(reload);
  };

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 기존 마크다운 파일을 새 노트로 (#72) — 다중 선택 지원
  const importMd = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: true,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    const paths = Array.isArray(sel) ? sel : typeof sel === "string" ? [sel] : [];
    for (const p of paths) await api.importMarkdown(p).catch(() => {});
    if (paths.length) reload();
  };

  const applyGroup = async (name: string) => {
    for (const id of selected) {
      await api.saveMeta(id, { group: name }).catch(() => {});
    }
    setSelecting(false);
    setSelected(new Set());
    reload();
  };

  if (view === "settings") return <SettingsView onBack={() => setView("list")} />;
  if (view === "trash") return <TrashView onBack={() => setView("list")} onRestored={reload} />;
  if (detailId)
    return (
      <DetailView
        noteId={detailId}
        onBack={() => {
          setDetailId(null);
          reload();
        }}
      />
    );

  const shown = filterNotes(notes, query);
  const groupNames = [
    ...new Set(notes.map((n) => n.meta.group).filter((g): g is string => !!g)),
  ].sort();
  const grouped = new Map<string, typeof shown>();
  const loose: typeof shown = [];
  for (const n of shown) {
    if (n.meta.group) {
      if (!grouped.has(n.meta.group)) grouped.set(n.meta.group, []);
      grouped.get(n.meta.group)!.push(n);
    } else loose.push(n);
  }
  for (const arr of grouped.values()) arr.sort((a, b) => a.meta.group_order - b.meta.group_order);
  const sections: [string | null, typeof shown][] = [
    ...[...grouped.keys()].sort().map((g) => [g, grouped.get(g)!] as [string, typeof shown]),
    ...(loose.length ? [[null, loose] as [null, typeof shown]] : []),
  ];
  return (
    <div className="list">
      <div className="list-header">
        <input placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button
          className="icon-btn"
          title={t("newNoteShort")}
          onClick={() => api.createNote().then(reload)}
        >
          <PlusIcon />
        </button>
        <button className="icon-btn" title={t("importMd")} onClick={importMd}>
          <ImportIcon />
        </button>
        <button
          className="icon-btn"
          title={t("selectToGroup")}
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
        >
          <CheckboxIcon />
        </button>
        <button className="icon-btn" title={t("trash")} onClick={() => setView("trash")}>
          <TrashIcon />
        </button>
        {updater && (
          <button
            className={"icon-btn update-btn" + (updater.installing ? " installing" : "")}
            disabled={updater.installing}
            title={
              updater.installing ? t("installingUpdate") : t("updateTo", { v: updater.version })
            }
            aria-label={
              updater.installing ? t("installingUpdate") : t("updateTo", { v: updater.version })
            }
            onClick={updater.run}
          >
            <UpdateIcon />
          </button>
        )}
        <button className="icon-btn" title={t("settings")} onClick={() => setView("settings")}>
          <GearIcon />
        </button>
      </div>
      <div className="list-items">
        {sections.map(([g, arr]) => (
          <div key={g ?? "__loose"}>
            {(g || sections.length > 1) && (
              <div className="group-label">
                {g && renaming?.group === g ? (
                  <span className="group-rename">
                    <input
                      className="font-custom"
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ group: g, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const next = renaming.value.trim();
                          if (!next || next === g) {
                            setRenaming(null);
                            return;
                          }
                          api
                            .renameGroup(g, next)
                            .then(() => {
                              setRenaming(null);
                              reload();
                            })
                            // 거부 사유를 입력 밑에 그대로 — 고쳐서 재시도할 수 있게 연다
                            .catch((err) =>
                              setRenaming({ group: g, value: next, error: String(err) }),
                            );
                        }
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                    {renaming.error && <span className="group-rename-error">{renaming.error}</span>}
                  </span>
                ) : (
                  <>
                    {g ?? t("looseNotes")}
                    {g && (
                      <button
                        className="group-rename-btn"
                        title={t("renameGroup")}
                        onClick={() => setRenaming({ group: g, value: g })}
                      >
                        <PencilIcon />
                      </button>
                    )}
                  </>
                )}
                <span className="group-count">{arr.length}</span>
              </div>
            )}
            <div className="inset-group">
              {arr.map((n) => (
                <div
                  key={n.meta.id}
                  className={"list-row" + (n.meta.hidden ? " row-hidden" : "")}
                  onClick={() => (selecting ? toggleSel(n.meta.id) : api.openNote(n.meta.id))}
                >
                  {selecting && (
                    <span className={"sel-dot" + (selected.has(n.meta.id) ? " on" : "")} />
                  )}
                  <span className="dot" data-color={n.meta.color} />
                  <span className="title">{noteTitle(n)}</span>
                  {n.meta.hidden && <span className="hidden-chip">{t("hiddenChip")}</span>}
                  <span className="row-dim">{relativeTime(n.meta.updated_at, lang)}</span>
                  {!selecting && (
                    <>
                      <button
                        className="row-info"
                        title={t("detailView")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(n.meta.id);
                        }}
                      >
                        <InfoIcon />
                      </button>
                      <button
                        className="row-delete"
                        title={t("delete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(n.meta.id);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="empty">{t("emptyList")}</p>}
      </div>
      {selecting && (
        <div className="sel-bar">
          {selected.size > 0 ? (
            <>
              <input
                className="font-custom"
                placeholder={t("groupNamePlaceholder")}
                list="group-names"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = e.currentTarget.value.trim();
                    if (v) applyGroup(v);
                  }
                }}
              />
              <datalist id="group-names">
                {groupNames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <button onClick={() => applyGroup("")}>{t("ungroup")}</button>
            </>
          ) : (
            <span className="row-dim">{t("selectPrompt")}</span>
          )}
          <button
            onClick={() => {
              setSelecting(false);
              setSelected(new Set());
            }}
          >
            {t("cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
