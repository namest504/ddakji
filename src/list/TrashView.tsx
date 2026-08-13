import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { TrashedNote } from "../lib/api";
import { noteTitle, relativeTime } from "../lib/noteUtils";
import { BackIcon } from "../note/icons";

/**
 * 휴지통 (#112) — 지운 노트는 여기 남는다. 삭제가 어디서 일어났든(뒷면 삭제·
 * 목록·CLI·MCP) 저장 계층이 파일을 옮기기만 하므로 전부 여기로 모인다.
 *
 * 영구 삭제만이 파일을 실제로 지운다 — 그래서 이 화면에서만 확인을 받는다.
 */
export default function TrashView({
  onBack,
  onRestored,
}: {
  onBack: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<TrashedNote[]>([]);

  const reload = useCallback(() => {
    api
      .listTrash()
      .then(setItems)
      .catch(() => {});
  }, []);
  useEffect(reload, [reload]);

  const confirm = async (message: string, okLabel: string) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(message, { title: "영구 삭제", kind: "warning", okLabel, cancelLabel: "취소" });
  };

  const restore = (id: string) =>
    api
      .restoreNote(id)
      .then(() => {
        reload();
        onRestored();
      })
      .catch(() => {});

  const purge = async (id: string) => {
    if (await confirm("이 노트를 완전히 지울까요? 되돌릴 수 없습니다.", "영구 삭제"))
      api
        .purgeNote(id)
        .then(reload)
        .catch(() => {});
  };

  const empty = async () => {
    if (
      await confirm(
        `휴지통의 노트 ${items.length}개를 완전히 지울까요? 되돌릴 수 없습니다.`,
        "비우기",
      )
    )
      api
        .emptyTrash()
        .then(reload)
        .catch(() => {});
  };

  return (
    <div className="list settings">
      <div className="list-header">
        <button className="icon-btn" title="뒤로" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="settings-title">휴지통</span>
        <span className="spacer" />
        {items.length > 0 && (
          <button className="trash-empty" onClick={empty}>
            비우기
          </button>
        )}
      </div>
      <div className="list-items">
        {items.length === 0 ? (
          <div className="empty">
            휴지통이 비어 있습니다.
            <div className="trash-hint">지운 노트는 여기 남고, 언제든 되돌릴 수 있습니다.</div>
          </div>
        ) : (
          <div className="inset-group">
            {items.map(({ note, deleted_at }) => (
              <div className="list-row" key={note.meta.id}>
                <span className="dot" data-color={note.meta.color} />
                <span className="title">{noteTitle(note)}</span>
                <span className="row-dim">{relativeTime(deleted_at)}</span>
                <button
                  className="trash-action"
                  title="이 노트를 목록으로 되돌린다"
                  onClick={() => restore(note.meta.id)}
                >
                  복원
                </button>
                <button
                  className="trash-action danger"
                  title="파일까지 지운다 — 되돌릴 수 없다"
                  onClick={() => purge(note.meta.id)}
                >
                  영구 삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
