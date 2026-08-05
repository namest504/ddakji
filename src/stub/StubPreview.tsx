import { useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Note } from "../lib/api";
import { fontStack, noteTitle, plainPreview } from "../lib/noteUtils";

// Alt-Tab 대표(스텁) 창의 내용. 화면 밖에 있지만 DWM이 이 창을 합성하므로
// 여기 그리는 것이 곧 Alt-Tab 썸네일이 된다 — 가장 최근에 본 노트를 미리보기로.
export default function StubPreview() {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    const load = () => api.getLastViewed().then(setNote).catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  if (!note) return <div className="stub-empty">stickdown</div>;
  const m = note.meta;
  return (
    <div className="note stub-preview" data-color={m.color}
      style={{ fontFamily: fontStack(m.font_family) }}>
      <div className="stub-title">{noteTitle(note)}</div>
      <div className="stub-body">{plainPreview(note.body).slice(0, 600)}</div>
    </div>
  );
}
