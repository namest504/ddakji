import type { Note } from "../lib/api";
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
  const m = note.meta;
  return (
    <div className="content note-back slide-next">
      <div className="back-title">뒷면</div>
      <div className="back-row">
        <span className="back-k">만든 날</span>
        <span>{fullDateTime(m.created_at)}</span>
      </div>
      <div className="back-row">
        <span className="back-k">모음집</span>
        <span>{m.group ?? "없음"}</span>
      </div>
      <div className="back-row">
        <span className="back-k">파일</span>
        <span className="path-text">{m.id}.md</span>
      </div>
      <div className="back-actions">
        <button onClick={onReveal}>파일 위치 열기</button>
        <button className="back-danger" onClick={onDelete}>
          삭제
        </button>
      </div>
    </div>
  );
}
