import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { filterNotes, noteTitle } from "../lib/noteUtils";

export default function ListApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");

  const reload = useCallback(() => { api.listNotes().then(setNotes); }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 2000); // 단순 폴링 (v1)
    return () => clearInterval(t);
  }, [reload]);

  const shown = filterNotes(notes, query);

  return (
    <div className="list">
      <div className="list-header">
        <input placeholder="검색…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={() => api.createNote().then(reload)}>＋ 새 노트</button>
      </div>
      <div className="list-items">
        {shown.map((n) => (
          <div key={n.meta.id} className="list-item" data-color={n.meta.color}
            onClick={() => api.openNote(n.meta.id)}>
            <span className="title">{noteTitle(n)}</span>
            <button title="삭제" onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("삭제할까요?")) api.deleteNote(n.meta.id).then(reload);
            }}>🗑</button>
          </div>
        ))}
        {shown.length === 0 && <p style={{ padding: 16, color: "#888" }}>노트가 없습니다.</p>}
      </div>
    </div>
  );
}
