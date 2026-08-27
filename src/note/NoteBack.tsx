import type { Note } from "../lib/api";
import { useT } from "../lib/i18n";
import { fullDateTime } from "../lib/noteUtils";

/**
 * 딱지 뒷면 — 만든 날·모음집·파일 경로와, 되돌릴 수 없는 동작(삭제)의 제자리.
 * 앞면과는 장 넘김과 같은 좌우 슬라이드로 오간다 (딱지 시안, 2026-08-11).
 */
export default function NoteBack({
  note,
  onReveal,
  onDelete,
}: {
  note: Note;
  onReveal: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const m = note.meta;
  return (
    <div className="content note-back slide-next">
      <div className="back-title">{t("backTitle")}</div>
      <div className="back-row">
        <span className="back-k">{t("createdAt")}</span>
        <span>{fullDateTime(m.created_at)}</span>
      </div>
      <div className="back-row">
        <span className="back-k">{t("group")}</span>
        <span>{m.group ?? t("none")}</span>
      </div>
      <div className="back-row">
        <span className="back-k">{t("file")}</span>
        <span className="path-text">{m.id}.md</span>
      </div>
      <div className="back-actions">
        <button onClick={onReveal}>{t("revealFile")}</button>
        <button className="back-danger" onClick={onDelete}>
          {t("delete")}
        </button>
      </div>
    </div>
  );
}
