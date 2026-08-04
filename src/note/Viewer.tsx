import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

export default function Viewer({ body, onEdit }: { body: string; onEdit: () => void }) {
  const [root, setRoot] = useState<string | null>(null);
  useEffect(() => { api.dataRoot().then(setRoot); }, []);
  if (root === null) return null;
  const html = renderMarkdown(body, (rel) => convertFileSrc(`${root}/${rel}`));
  return (
    <div className="viewer" onDoubleClick={onEdit}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
