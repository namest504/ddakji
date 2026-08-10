import { useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { fullDateTime, noteTitle } from "../lib/noteUtils";
import { BackIcon } from "../note/icons";

// 노트 자세히 보기: 제목 지정(본문 파생 제목 대체)과 저장 일시 등 메타 확인
export default function DetailView({ noteId, onBack }: { noteId: string; onBack: () => void }) {
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    api.listNotes().then((all) => {
      const n = all.find((x) => x.meta.id === noteId) ?? null;
      setNote(n);
      setTitle(n?.meta.title ?? "");
    });
  }, [noteId]);

  if (!note) return null;
  const m = note.meta;

  const saveTitle = () => {
    api
      .saveMeta(noteId, { title: title.trim() })
      .then((n) => {
        setNote(n);
        setTitle(n.meta.title ?? "");
      })
      .catch(() => {});
  };

  return (
    <div className="list settings">
      <div className="list-header">
        <button className="icon-btn" title="뒤로" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="settings-title">자세히 보기</span>
      </div>
      <div className="list-items">
        <div className="group-label">제목</div>
        <div className="inset-group">
          <div className="settings-row">
            <input
              className="font-custom"
              value={title}
              placeholder={noteTitle({ ...note, meta: { ...m, title: null } })}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
          <div className="settings-row link" onClick={() => api.openNote(noteId)}>
            노트 열기
          </div>
          <div className="settings-row link" onClick={() => api.revealNote(noteId)}>
            파일 위치 열기
          </div>
        </div>

        <div className="group-label">정보</div>
        <div className="inset-group">
          <div className="settings-row">
            <span>만든 날짜</span>
            <span className="row-dim">{fullDateTime(m.created_at)}</span>
          </div>
          <div className="settings-row">
            <span>수정한 날짜</span>
            <span className="row-dim">{fullDateTime(m.updated_at)}</span>
          </div>
          <div className="settings-row">
            <span>모음집</span>
            <span className="row-dim">{m.group ?? "없음"}</span>
          </div>
          <div className="settings-row">
            <span>색상</span>
            <span className="dot" data-color={m.color} />
          </div>
          <div className="settings-row">
            <span>파일</span>
            <span className="row-dim path-text">{m.id}.md</span>
          </div>
        </div>
      </div>
    </div>
  );
}
