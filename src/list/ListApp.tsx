import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { filterNotes, noteTitle, relativeTime } from "../lib/noteUtils";
import { GearIcon, PlusIcon, TrashIcon } from "../note/icons";
import SettingsView from "./SettingsView";

export default function ListApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "settings">("list");

  const reload = useCallback(() => { api.listNotes().then(setNotes); }, []);
  useEffect(() => {
    reload();
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

  if (view === "settings") return <SettingsView onBack={() => setView("list")} />;

  const shown = filterNotes(notes, query);
  return (
    <div className="list">
      <div className="list-header">
        <input placeholder="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="icon-btn" title="새 노트" onClick={() => api.createNote().then(reload)}>
          <PlusIcon />
        </button>
        <button className="icon-btn" title="설정" onClick={() => setView("settings")}>
          <GearIcon />
        </button>
      </div>
      <div className="list-items">
        {shown.length > 0 && (
          <div className="inset-group">
            {shown.map((n) => (
              <div key={n.meta.id} className="list-row" onClick={() => api.openNote(n.meta.id)}>
                <span className="dot" data-color={n.meta.color} />
                <span className="title">{noteTitle(n)}</span>
                <span className="row-dim">{relativeTime(n.meta.updated_at)}</span>
                <button className="row-delete" title="삭제"
                  onClick={(e) => { e.stopPropagation(); remove(n.meta.id); }}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
        {shown.length === 0 && <p className="empty">노트가 없습니다. ＋로 시작하세요.</p>}
      </div>
    </div>
  );
}
