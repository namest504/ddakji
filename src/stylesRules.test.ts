import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// vitest는 CSS 임포트를 원문으로 주지 않으므로(빈 문자열 — 규칙이 전부
// "통과"로 위장된다) 파일을 직접 읽는다. vitest의 cwd는 프로젝트 루트다.
const css = readFileSync(join(process.cwd(), "src", "styles.css"), "utf-8");

/**
 * 레이어 규칙 가드 (#118 계열 4연속 재발 방지).
 *
 * 노트 창에는 숨은 오버레이가 있고(툴바·서식 바) 투명해도 클릭을 가져간다.
 * 그래서 겹칠 수 있는 요소는 전부 **명시적 레이어**를 가져야 한다 — DOM
 * 순서에 우연히 기대는 순간, 요소 하나를 추가할 때마다 "보이는데 눌리지
 * 않는 버튼"이 재발한다. 규칙 본문은 styles.css의 z 토큰 정의 옆에 있다.
 */
/** 부모가 스스로 스태킹을 관리하는 지역 위젯 — 전역 토큰이 필요 없다.
 *  여기 추가하려면 부모 선택자에 position:relative가 있어야 한다. */
const LOCAL_WIDGETS = [
  '.tiptap ul[data-type="taskList"] li[data-checked="true"] > label > span::after', // 체크 표시
  ".img-grip", // .img-wrap(relative) 안 그립
  ".img-grip::before",
  ".switch .knob", // .switch(relative) 안 손잡이
  ".flip-grip::before", // .flip-grip(z-nav) 안 빗금
];

// 주석 속 예시 문구("position:absolute" 등)가 규칙 검사에 걸리지 않도록
// 파싱 전에 주석부터 벗긴다.
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
const blocks = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim(),
  body: m[2],
}));

describe("styles.css 레이어 규칙", () => {
  it("absolute/fixed 요소는 전역 z 토큰을 갖거나 지역 위젯 목록에 있어야 한다", () => {
    const offenders = blocks
      .filter((b) => /position:\s*(absolute|fixed)/.test(b.body))
      .filter((b) => !/z-index:\s*var\(--z-/.test(b.body))
      .map((b) => b.selector)
      .filter((sel) => !LOCAL_WIDGETS.some((w) => sel.endsWith(w)));
    expect(offenders, "레이어 미지정 오버레이 — styles.css의 z 토큰 표 참조").toEqual([]);
  });

  it("z-index 숫자 직접 지정은 :root 토큰 정의에서만 허용된다", () => {
    const offenders = blocks
      .filter((b) => !b.selector.startsWith(":root"))
      .filter((b) => /z-index:\s*\d/.test(b.body))
      .map((b) => b.selector);
    expect(offenders, "토큰(var(--z-*))을 쓸 것 — 숫자는 표에서만").toEqual([]);
  });

  it("알림 배너는 팝오버와 다른 레이어여야 한다 (동점 금지)", () => {
    // 같은 값이면 DOM 순서가 승부를 정한다 — 그 우연이 4번의 버그였다.
    const banner = blocks.find((b) => b.selector.includes(".merge-undo") && /z-index/.test(b.body));
    expect(banner?.body).toMatch(/var\(--z-banner\)/);
    const popover = blocks.find((b) => b.selector === ".color-row");
    expect(popover?.body).toMatch(/var\(--z-pop\)/);
  });

  it("지역 위젯 목록의 부모는 실제로 스태킹 컨텍스트를 만든다", () => {
    // 목록이 면죄부로 남용되지 않게 — 부모가 relative가 아니면 지역이 아니다
    const parentOf: Record<string, string> = {
      ".img-grip": ".img-wrap",
      ".switch .knob": ".switch",
    };
    for (const [child, parent] of Object.entries(parentOf)) {
      const p = blocks.find((b) => b.selector.endsWith(parent));
      expect(p?.body, `${child}의 부모 ${parent}`).toMatch(/position:\s*relative/);
    }
  });
});
