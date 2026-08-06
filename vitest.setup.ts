// jsdom에는 레이아웃 API가 없어 ProseMirror(scrollToSelection 등)가 죽는다 —
// 컴포넌트 테스트에서 에디터를 실제 마운트하기 위한 최소 폴리필.
const zeroRect = {
  x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
  toJSON: () => ({}),
} as DOMRect;

const rectList = () => {
  const list = [zeroRect] as unknown as DOMRectList;
  (list as unknown as { item: (i: number) => DOMRect | null }).item = (i) =>
    i === 0 ? zeroRect : null;
  return list;
};

if (typeof Range !== "undefined") {
  Range.prototype.getBoundingClientRect = () => zeroRect;
  Range.prototype.getClientRects = rectList;
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
