import { InputRule } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import Image from "@tiptap/extension-image";
import { TaskItem } from "@tiptap/extension-list";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 체크박스 입력 룰.
 *
 * `- [ ] `처럼 불렛 변환 직후 태스크 변환이 이어지면 기본 wrappingInputRule이
 * bulletList>taskItem(스키마 위반) 구조를 만들다 줄을 유실시킨다(#39, 간헐).
 * 명령 기반 변환(toggleTaskList)은 리스트 구조를 올바르게 바꿔준다.
 */
export const TaskItemSafe = TaskItem.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*(\[([ xX]?)\])\s$/,
        handler: ({ state, range, match, chain }) => {
          const checked = (match[2] || "").toLowerCase() === "x";
          const parent = state.doc.resolve(range.from).node(-1);
          const alreadyTask = parent?.type.name === "taskItem";
          const c = chain().deleteRange(range);
          if (!alreadyTask) c.toggleTaskList();
          if (checked) c.updateAttributes("taskItem", { checked: true });
          // 변환 뒤 커서를 항목의 텍스트 위치로 명시 정규화 — WebKitGTK에서
          // 셀렉션이 붕 떠 이후 타이핑이 버려지는 것을 방지 (#39)
          c.command(({ tr }) => {
            tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)));
            return true;
          });
          c.run();
        },
      }),
    ];
  },
});

/**
 * 크기를 기억하는 이미지 (#113).
 *
 * 노트는 평문 마크다운으로 저장되는데 `![](경로)`에는 크기를 담을 자리가 없다.
 * 그래서 **크기를 바꾼 이미지만** `<img width>`로 직렬화하고, 손대지 않은
 * 이미지는 `![]()` 그대로 둔다 — 대가를 건드린 이미지에만 지불한다.
 *
 * 읽는 쪽은 이미 `Markdown.configure({ html: true })`라 공짜다.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      /** 표시 폭(px). null이면 원본 크기 — 마크다운에도 흔적을 남기지 않는다 */
      width: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("width") ?? el.style.width;
          const n = Number.parseInt(String(raw ?? ""), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: String(attrs.width) } : {}),
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: Record<string, unknown> },
        ) {
          const src = String(node.attrs.src ?? "");
          const alt = String(node.attrs.alt ?? "");
          const title = node.attrs.title ? String(node.attrs.title) : "";
          const width = node.attrs.width;
          if (width) {
            const t = title ? ` title="${title}"` : "";
            state.write(`<img src="${src}" alt="${alt}"${t} width="${String(width)}">`);
          } else {
            state.write(`![${alt}](${src}${title ? ` "${title}"` : ""})`);
          }
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

/** 드래그로 정해지는 이미지 폭 — 너무 작아 잡을 수 없거나 노트를 넘지 않게 */
export const MIN_IMAGE_WIDTH = 48;
export function clampImageWidth(start: number, dx: number, max: number): number {
  const upper = Math.max(MIN_IMAGE_WIDTH, Math.floor(max));
  return Math.round(Math.min(upper, Math.max(MIN_IMAGE_WIDTH, start + dx)));
}

/**
 * 이미지 노드의 화면 표시용 확장.
 *
 * 문서(마크다운)에는 `assets/` 상대경로를 그대로 두고, 그릴 때만 asset URL로
 * 바꾼다. 직렬화는 node attrs(상대경로)를 읽으므로 저장 포맷이 오염되지 않는다.
 *
 * 크기 조절은 오른쪽 아래 **빗금 그립**을 끌어서 한다 — 딱지 뒷면을 여는 그립과
 * 같은 어휘라 "여기를 잡는다"가 설명 없이 읽힌다. 두 번 누르면 원래 크기로.
 */
export const assetImage = (base: string) =>
  ResizableImage.extend({
    renderHTML({ HTMLAttributes }) {
      const src = String(HTMLAttributes.src ?? "");
      const resolved = src.startsWith("assets/") ? convertFileSrc(`${base}/${src}`) : src;
      return ["img", { ...HTMLAttributes, src: resolved }];
    },

    addNodeView() {
      return ({ node, editor, getPos }) => {
        const wrap = document.createElement("span");
        wrap.className = "img-wrap";
        const img = document.createElement("img");
        const grip = document.createElement("span");
        grip.className = "img-grip";
        grip.title = "끌어서 크기 조절 · 두 번 누르면 원래 크기";

        const paint = (n: typeof node) => {
          const src = String(n.attrs.src ?? "");
          img.src = src.startsWith("assets/") ? convertFileSrc(`${base}/${src}`) : src;
          img.alt = String(n.attrs.alt ?? "");
          img.style.width = n.attrs.width ? `${String(n.attrs.width)}px` : "";
        };
        paint(node);
        wrap.append(img, grip);

        const commit = (width: number | null) => {
          const pos = typeof getPos === "function" ? getPos() : null;
          if (pos == null) return;
          editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, "width", width));
        };

        let startX = 0;
        let startW = 0;
        const onMove = (e: PointerEvent) => {
          const max = wrap.parentElement?.clientWidth ?? startW;
          img.style.width = `${String(clampImageWidth(startW, e.clientX - startX, max))}px`;
        };
        const onUp = (e: PointerEvent) => {
          grip.removeEventListener("pointermove", onMove);
          grip.removeEventListener("pointerup", onUp);
          const max = wrap.parentElement?.clientWidth ?? startW;
          commit(clampImageWidth(startW, e.clientX - startX, max));
        };
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          startX = e.clientX;
          startW = img.getBoundingClientRect().width;
          grip.setPointerCapture(e.pointerId);
          grip.addEventListener("pointermove", onMove);
          grip.addEventListener("pointerup", onUp);
        });
        // 원래 크기로 되돌리기 — 폭 속성을 지우면 마크다운도 평문으로 돌아간다
        grip.addEventListener("dblclick", (e) => {
          e.preventDefault();
          img.style.width = "";
          commit(null);
        });

        return {
          dom: wrap,
          update: (updated) => {
            if (updated.type.name !== node.type.name) return false;
            paint(updated);
            return true;
          },
          // 그립에서 시작된 입력은 에디터가 아니라 우리가 처리한다
          stopEvent: (e) => e.target === grip,
          ignoreMutation: () => true,
        };
      };
    },
  });
