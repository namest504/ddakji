import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import * as api from "../../lib/api";
import type { SaveGuard } from "./useSaveGuard";

interface Options {
  noteId: string;
  editorRef: React.MutableRefObject<Editor | null>;
  guard: SaveGuard;
}

/**
 * 이미지 삽입 — 붙여넣기·드롭·서식바 버튼 공용.
 *
 * 파일은 `assets/<노트 id>/`에 저장하고 **상대경로**를 문서에 넣는다. 화면에
 * 그릴 때만 asset URL로 바꾸므로(RichEditor) 저장 포맷이 오염되지 않는다.
 */
export function useImageInsert({ noteId, editorRef, guard }: Options) {
  const insertRel = useCallback(
    (rel: string, pos?: number) => {
      const ed = editorRef.current;
      if (!ed) return;
      // pos가 있으면 드롭 지점에, 없으면 현재 커서에
      if (pos !== undefined) {
        ed.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: rel } }).run();
      } else {
        ed.chain().focus().setImage({ src: rel }).run();
      }
    },
    [editorRef],
  );

  const savePastedImage = useCallback(
    (file: File, pos?: number) => {
      guard(`image:${crypto.randomUUID()}`, async () => {
        const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const bytes = new Uint8Array(await file.arrayBuffer());
        insertRel(await api.saveImage(noteId, ext, bytes), pos);
      });
    },
    [guard, insertRel, noteId],
  );

  const pickImage = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: false,
      filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (typeof sel !== "string") return;
    guard(`image:${crypto.randomUUID()}`, async () => {
      insertRel(await api.importImage(noteId, sel));
    });
  }, [guard, insertRel, noteId]);

  return { savePastedImage, pickImage };
}
