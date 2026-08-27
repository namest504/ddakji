import { describe, expect, it } from "vitest";
import { en, ko, resolveLang, translate, type MsgKey } from "./i18n";

describe("i18n (#143)", () => {
  it("system은 OS 언어를 따른다 — ko*면 ko, 그 외 en", () => {
    expect(resolveLang("system", "ko-KR")).toBe("ko");
    expect(resolveLang("system", "ko")).toBe("ko");
    expect(resolveLang("system", "en-US")).toBe("en");
    expect(resolveLang("system", "ja-JP")).toBe("en");
  });

  it("명시 설정은 OS를 무시한다", () => {
    expect(resolveLang("en", "ko-KR")).toBe("en");
    expect(resolveLang("ko", "en-US")).toBe("ko");
  });

  it("보간 자리는 값으로 채워진다", () => {
    expect(translate("ko", "minutesAgo", { n: 5 })).toBe("5분 전");
    expect(translate("en", "updateTo", { v: "0.1.8" })).toBe("Update to v0.1.8");
  });

  it("양쪽 사전에 빈 값이나 남은 자리표시자가 없다", () => {
    for (const key of Object.keys(ko) as MsgKey[]) {
      expect(ko[key].length, `ko.${key}`).toBeGreaterThan(0);
      expect(en[key].length, `en.${key}`).toBeGreaterThan(0);
    }
    // {x} 자리는 양쪽이 같은 변수 집합을 써야 한다 — 한쪽만 있으면 보간이 샌다
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(ko) as MsgKey[]) {
      expect(vars(en[key]), `${key}의 자리표시자`).toEqual(vars(ko[key]));
    }
  });
});
