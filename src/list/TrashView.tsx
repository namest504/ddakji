import { useCallback, useEffect, useState } from "react";
import { useLang, useT } from "../lib/i18n";
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
  const t = useT();
  const lang = useLang();
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
    return ask(message, { title: t("purge"), kind: "warning", okLabel, cancelLabel: t("cancel") });
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
    if (await confirm(t("purgeConfirm"), t("purge")))
      api
        .purgeNote(id)
        .then(reload)
        .catch(() => {});
  };

  const empty = async () => {
    if (await confirm(t("emptyTrashConfirm", { n: items.length }), t("emptyTrash")))
      api
        .emptyTrash()
        .then(reload)
        .catch(() => {});
  };

  return (
    <div className="list settings">
      <div className="list-header">
        <button className="icon-btn" title={t("goBack")} onClick={onBack}>
          <BackIcon />
        </button>
        <span className="settings-title">{t("trash")}</span>
        <span className="spacer" />
        {items.length > 0 && (
          <button className="trash-empty" onClick={empty}>
            {t("emptyTrash")}
          </button>
        )}
      </div>
      <div className="list-items">
        {items.length === 0 ? (
          <div className="empty">
            {t("trashEmpty")}
            <div className="trash-hint">{t("trashHint")}</div>
          </div>
        ) : (
          <div className="inset-group">
            {items.map(({ note, deleted_at }) => (
              <div className="list-row" key={note.meta.id}>
                <span className="dot" data-color={note.meta.color} />
                <span className="title">{noteTitle(note)}</span>
                <span className="row-dim">{relativeTime(deleted_at, lang)}</span>
                <button
                  className="trash-action"
                  title={t("restoreNote")}
                  onClick={() => restore(note.meta.id)}
                >
                  {t("restore")}
                </button>
                <button
                  className="trash-action danger"
                  title={t("purgeTitle")}
                  onClick={() => purge(note.meta.id)}
                >
                  {t("purge")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
