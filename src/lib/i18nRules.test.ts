import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 하드코딩 한국어 가드 (#143). UI 문자열은 사전(i18n.tsx)에만 산다 —
 * 컴포넌트에 한국어가 직접 남으면 영어 모드에서 그 조각만 한국어로 남는다
 * ("사용법 보기"가 실제로 그렇게 샜다). 주석은 한국어가 정상이므로,
 * 실수가 일어나는 두 자리만 본다: 단독 줄 JSX 텍스트와 문자열 속성.
 */
const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx|ts)$/.test(name) && !/\.test\.|i18n/.test(name) ? [p] : [];
  });
}

const HANGUL = /[가-힣]/;
// 단독 줄 JSX 텍스트: 공백 뒤 바로 한글로 시작하는 줄 (주석·문자열 아님)
const bareJsxText = (line: string) => /^\s+[가-힣]/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line);
// 사용자 노출 속성에 든 한국어 리터럴
const koreanAttr = (line: string) =>
  /(title|placeholder|aria-label|okLabel|cancelLabel|label)\s*[:=]\s*["'`][^"'`]*[가-힣]/.test(
    line,
  ) && !/^\s*(\/\/|\*)/.test(line);

describe("i18n 하드코딩 가드", () => {
  it("컴포넌트에 한국어 UI 문자열이 직접 박혀 있지 않다", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (!HANGUL.test(line)) return;
        if (bareJsxText(line) || koreanAttr(line)) {
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim().slice(0, 60)}`);
        }
      });
    }
    expect(offenders, "사전(t(...))으로 옮길 것").toEqual([]);
  });
});
