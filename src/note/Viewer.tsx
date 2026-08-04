import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

export default function Viewer({ body, onEdit }: { body: string; onEdit: () => void }) {
  const [root, setRoot] = useState<string | null>(null);
  useEffect(() => { api.dataRoot().then(setRoot).catch(() => setRoot("")); }, []);
  if (root === null) return null;
  // Windows 데이터 루트는 백슬래시를 쓰므로, asset URL을 만들기 전에 슬래시로 통일한다.
  const base = root.replace(/\\/g, "/");
  const html = renderMarkdown(body, (rel) => convertFileSrc(`${base}/${rel}`));
  return (
    <div className="viewer" onDoubleClick={onEdit}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
