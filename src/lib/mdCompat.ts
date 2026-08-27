/**
 * 마크다운 ↔ 에디터 관문 (#166).
 *
 * tiptap-markdown은 **빈 체크박스**(`- [ ] `)를 문맥에 따라 잘못 읽는다 —
 * 느슨한 리스트 머리에 있고 뒤에 항목이 이어지면 한 줄을 두 노드(빈
 * taskItem + 리터럴 "[ ]" 불릿)로 복제하고, 단독이면 리터럴 불릿으로
 * 강등한다. 저장은 둘 다 기록하므로 재시작마다 한 줄씩 불어났다.
 *
 * 파서를 고치는 대신 관문에서 애매함을 없앤다: 에디터로 들어갈 때 빈
 * 체크박스에 zero-width space를 넣어 "내용 있는 항목"으로 만들고, 나올 때
 * 도로 벗긴다. 디스크 포맷은 그대로 `- [ ] `다.
 */

const ZWSP = "\u200b";

/** 디스크 → 에디터: 빈 체크박스 줄에 자리표시자 주입 */
export function toEditorMarkdown(body: string): string {
  return body.replace(/^(\s*[-*] \[[ xX]\]) *$/gm, `$1 ${ZWSP}`);
}

/** 에디터 → 디스크: 자리표시자 제거 (사용자가 입력을 시작하면 흔적 없이) */
export function fromEditorMarkdown(md: string): string {
  return md.replaceAll(ZWSP, "");
}
