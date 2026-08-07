import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { hasMoreBelow } from "../../lib/noteUtils";

/**
 * 스크롤바를 숨긴 대신 "아래에 더 있음"을 화살표로 알린다.
 *
 * 스크롤·창 크기뿐 아니라 **이미지가 늦게 로드되어 길어지는 경우**까지 잡아야
 * 하므로 load(캡처)와 ResizeObserver를 함께 본다.
 */
export function useScrollHint(editor: Editor | null, fontSize: number | undefined) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const update = useCallback(() => {
    const el = contentRef.current?.querySelector<HTMLElement>(".content-editor");
    setMore(el ? hasMoreBelow(el.scrollHeight, el.scrollTop, el.clientHeight) : false);
  }, []);

  useEffect(() => {
    const el = contentRef.current?.querySelector<HTMLElement>(".content-editor");
    if (!el) return;
    update();
    el.addEventListener("scroll", update);
    // load는 버블링하지 않으므로 캡처 단계에서 듣는다
    el.addEventListener("load", update, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("load", update, true);
      ro?.disconnect();
    };
  }, [editor, fontSize, update]);

  return { contentRef, more };
}
