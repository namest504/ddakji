import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { fullDateTime, noteTitle } from "../lib/noteUtils";
import { BackIcon } from "../note/icons";

// 노트 자세히 보기: 제목 지정(본문 파생 제목 대체)과 저장 일시 등 메타 확인
export default function DetailView({ noteId, onBack }: { noteId: string; onBack: () => void }) {
  const t = useT();
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
        <button className="icon-btn" title={t("goBack")} onClick={onBack}>
          <BackIcon />
        </button>
        <span className="settings-title">{t("detailView")}</span>
      </div>
      <div className="list-items">
        <div className="group-label">{t("title")}</div>
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
            {t("openNote")}
          </div>
          <div className="settings-row link" onClick={() => api.revealNote(noteId)}>
            {t("revealFile")}
          </div>
        </div>

        <div className="group-label">{t("info")}</div>
        <div className="inset-group">
          <div className="settings-row">
            <span>{t("createdDate")}</span>
            <span className="row-dim">{fullDateTime(m.created_at)}</span>
          </div>
          <div className="settings-row">
            <span>{t("updatedDate")}</span>
            <span className="row-dim">{fullDateTime(m.updated_at)}</span>
          </div>
          <div className="settings-row">
            <span>{t("group")}</span>
            <span className="row-dim">{m.group ?? t("none")}</span>
          </div>
          <div className="settings-row">
            <span>{t("color")}</span>
            <span className="dot" data-color={m.color} />
          </div>
          <div className="settings-row">
            <span>{t("file")}</span>
            <span className="row-dim path-text">{m.id}.md</span>
          </div>
        </div>
      </div>
    </div>
  );
}
