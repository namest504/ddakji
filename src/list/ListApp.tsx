import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { filterNotes, noteTitle, relativeTime } from "../lib/noteUtils";
import { CheckboxIcon } from "../note/icons";
import { GearIcon, ImportIcon, InfoIcon, PlusIcon, TrashIcon } from "../note/icons";
import DetailView from "./DetailView";
import SettingsView from "./SettingsView";

export default function ListApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "settings">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reload = useCallback(() => { api.listNotes().then(setNotes); }, []);
  useEffect(() => {
    reload();
    // 창은 visible:false로 생성된다 — 첫 렌더 후 표시 (흰 화면 플래시 제거)
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win.show().then(() => win.setFocus()).catch(() => {});
    });
    const t = setInterval(reload, 2000); // 단순 폴링 (v1)
    return () => clearInterval(t);
  }, [reload]);

  const remove = async (id: string) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const ok = await ask("이 노트를 삭제할까요? 되돌릴 수 없습니다.", {
      title: "노트 삭제", kind: "warning", okLabel: "삭제", cancelLabel: "취소",
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
  if (detailId) return <DetailView noteId={detailId} onBack={() => { setDetailId(null); reload(); }} />;

  const shown = filterNotes(notes, query);
  const groupNames = [...new Set(notes.map((n) => n.meta.group).filter((g): g is string => !!g))].sort();
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
        <input placeholder="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="icon-btn" title="새 노트" onClick={() => api.createNote().then(reload)}>
          <PlusIcon />
        </button>
        <button className="icon-btn" title="마크다운 가져오기" onClick={importMd}>
          <ImportIcon />
        </button>
        <button className="icon-btn" title="선택해서 모음집으로 묶기"
          onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
          <CheckboxIcon />
        </button>
        <button className="icon-btn" title="설정" onClick={() => setView("settings")}>
          <GearIcon />
        </button>
      </div>
      <div className="list-items">
        {sections.map(([g, arr]) => (
          <div key={g ?? "__loose"}>
            {(g || sections.length > 1) && (
              <div className="group-label">
                {g ?? "노트"}<span className="group-count">{arr.length}</span>
              </div>
            )}
            <div className="inset-group">
              {arr.map((n) => (
                <div key={n.meta.id} className="list-row"
                  onClick={() => (selecting ? toggleSel(n.meta.id) : api.openNote(n.meta.id))}>
                  {selecting && <span className={"sel-dot" + (selected.has(n.meta.id) ? " on" : "")} />}
                  <span className="dot" data-color={n.meta.color} />
                  <span className="title">{noteTitle(n)}</span>
                  <span className="row-dim">{relativeTime(n.meta.updated_at)}</span>
                  {!selecting && (
                    <>
                      <button className="row-info" title="자세히 보기"
                        onClick={(e) => { e.stopPropagation(); setDetailId(n.meta.id); }}>
                        <InfoIcon />
                      </button>
                      <button className="row-delete" title="삭제"
                        onClick={(e) => { e.stopPropagation(); remove(n.meta.id); }}>
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="empty">노트가 없습니다. ＋로 시작하세요.</p>}
      </div>
      {selecting && (
        <div className="sel-bar">
          {selected.size > 0 ? (
            <>
              <input className="font-custom" placeholder="모음집 이름 (Enter)" list="group-names" autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = e.currentTarget.value.trim();
                    if (v) applyGroup(v);
                  }
                }} />
              <datalist id="group-names">
                {groupNames.map((g) => <option key={g} value={g} />)}
              </datalist>
              <button onClick={() => applyGroup("")}>해제</button>
            </>
          ) : (
            <span className="row-dim">묶을 노트를 선택하세요</span>
          )}
          <button onClick={() => { setSelecting(false); setSelected(new Set()); }}>취소</button>
        </div>
      )}
    </div>
  );
}
