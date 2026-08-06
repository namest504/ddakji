import { describe, expect, it } from "vitest";
import { clampFontSize, filterNotes, fontStack, hasMoreBelow, noteTitle, plainPreview, relativeTime } from "./noteUtils";
import type { Note } from "./api";

const note = (id: string, body: string): Note => ({
  meta: {
    id, created_at: "", updated_at: "", color: "yellow", font_size: 16,
    font_family: "system", viewer_mode: false, window: { x: 0, y: 0, w: 320, h: 340 },
    always_on_top: false, hidden: false, group_order: 0,
  },
  body,
});

describe("clampFontSize", () => {
  it("clamps to 10..40", () => {
    expect(clampFontSize(5)).toBe(10);
    expect(clampFontSize(16)).toBe(16);
    expect(clampFontSize(99)).toBe(40);
  });
});

describe("filterNotes", () => {
  const notes = [note("a", "장보기 목록"), note("b", "회의 메모 TODO")];
  it("empty query returns all", () => expect(filterNotes(notes, " ")).toHaveLength(2));
  it("matches case-insensitively", () => {
    expect(filterNotes(notes, "todo").map(n => n.meta.id)).toEqual(["b"]);
  });
  it("사용자 지정 제목도 검색된다 (#67)", () => {
    const titled = note("c", "본문에는 다른 말");
    titled.meta.title = "주간 회의록";
    expect(filterNotes([...notes, titled], "회의록").map(n => n.meta.id)).toEqual(["c"]);
    expect(filterNotes([titled], "다른 말").map(n => n.meta.id)).toEqual(["c"]);
  });
  it("no match returns empty", () => {
    expect(filterNotes(notes, "존재하지않는말")).toHaveLength(0);
  });
});

describe("noteTitle", () => {
  it("meta.title이 있으면 우선", () => {
    const n = note("a", "# 본문 제목");
    n.meta.title = "지정 제목";
    expect(noteTitle(n)).toBe("지정 제목");
  });
  it("uses first non-empty line without md syntax", () => {
    expect(noteTitle(note("a", "\n# 제목이다\n본문"))).toBe("제목이다");
  });
  it("falls back for empty note", () => expect(noteTitle(note("a", ""))).toBe("(빈 노트)"));
  it("preserves titles starting with digits", () => {
    expect(noteTitle(note("a", "2026 목표"))).toBe("2026 목표");
  });
  it("preserves 3D and similar mixed alphanumeric", () => {
    expect(noteTitle(note("a", "3D 프린터 구매"))).toBe("3D 프린터 구매");
  });
  it("strips numbered list markers", () => {
    expect(noteTitle(note("a", "1. 항목"))).toBe("항목");
  });
  it("체크박스 마커를 정제한다 (#66)", () => {
    expect(noteTitle(note("a", "- [ ] 할일"))).toBe("할일");
    expect(noteTitle(note("a", "- [x] 완료된 일"))).toBe("완료된 일");
    expect(noteTitle(note("a", "[ ] 장보기"))).toBe("장보기");
  });
  it("이미지 전용 첫 줄은 건너뛰고 다음 텍스트 줄에서 파생 (#66)", () => {
    expect(noteTitle(note("a", "![](assets/a/img.png)\n사진 설명"))).toBe("사진 설명");
    expect(noteTitle(note("a", "![대체텍스트](assets/a/img.png) 옆 텍스트"))).toBe("옆 텍스트");
  });
  it("이미지만 있는 노트는 빈 노트로", () => {
    expect(noteTitle(note("a", "![](assets/a/1.png)\n![](assets/a/2.png)"))).toBe("(빈 노트)");
  });
  it("링크는 텍스트만 남긴다", () => {
    expect(noteTitle(note("a", "[문서](https://example.com) 참고"))).toBe("문서 참고");
  });
});

describe("hasMoreBelow", () => {
  it("스크롤 여지가 임계값보다 크면 true", () => {
    expect(hasMoreBelow(500, 0, 300)).toBe(true);
  });
  it("바닥 근처(임계값 이내)면 false", () => {
    expect(hasMoreBelow(500, 195, 300)).toBe(false);
    expect(hasMoreBelow(300, 0, 300)).toBe(false);
  });
  it("정확히 임계값(8px)은 바닥으로 본다", () => {
    expect(hasMoreBelow(308, 0, 300)).toBe(false);
    expect(hasMoreBelow(309, 0, 300)).toBe(true);
  });
});

describe("clampFontSize 경계", () => {
  it("최소·최대 정확값은 그대로", () => {
    expect(clampFontSize(10)).toBe(10);
    expect(clampFontSize(40)).toBe(40);
  });
  it("반올림 후 클램프", () => {
    expect(clampFontSize(9.6)).toBe(10);
    expect(clampFontSize(15.4)).toBe(15);
    expect(clampFontSize(40.4)).toBe(40);
  });
});

describe("fontStack", () => {
  it("의미 키를 폰트 스택으로 매핑한다", () => {
    expect(fontStack("system")).toContain("Segoe UI");
    expect(fontStack("serif")).toContain("Georgia");
    expect(fontStack("mono")).toContain("Consolas");
  });
  it("프리셋 외 값은 커스텀 폰트로 (한글 폴백 포함)", () => {
    expect(fontStack("weird")).toBe('"weird", "Malgun Gothic", sans-serif');
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-08-05T14:00:00+09:00");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("1분 미만은 방금", () => {
    expect(relativeTime(ago(30_000), now)).toBe("방금");
  });
  it("분 단위", () => {
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5분 전");
  });
  it("같은 날은 시간 단위", () => {
    expect(relativeTime(ago(3 * 3600_000), now)).toBe("3시간 전");
  });
  it("하루 전·이틀 전·N일 전", () => {
    expect(relativeTime(ago(26 * 3600_000), now)).toBe("하루 전");
    expect(relativeTime(ago(50 * 3600_000), now)).toBe("이틀 전");
    expect(relativeTime(ago(5 * 24 * 3600_000), now)).toBe("5일 전");
  });
  it("7일 이상 같은 해는 월·일", () => {
    expect(relativeTime("2026-07-20T12:00:00+09:00", now)).toBe("7월 20일");
  });
  it("다른 해는 연도 포함", () => {
    expect(relativeTime("2025-12-30T12:00:00+09:00", now)).toBe("2025년 12월 30일");
  });
  it("파싱 불가면 빈 문자열", () => {
    expect(relativeTime("", now)).toBe("");
  });
  it("59분/60분 경계", () => {
    expect(relativeTime(ago(59 * 60_000), now)).toBe("59분 전");
    expect(relativeTime(ago(60 * 60_000), now)).toBe("1시간 전");
  });
  it("6일/7일 경계 — 7일부터는 날짜 표기", () => {
    expect(relativeTime(ago(6 * 24 * 3600_000), now)).toBe("6일 전");
    expect(relativeTime(ago(7 * 24 * 3600_000), now)).toBe("7월 29일");
  });
  it("미래 시각(기기 간 시계 오차)은 방금으로 관용 처리", () => {
    const future = new Date(now.getTime() + 5 * 60_000).toISOString();
    expect(relativeTime(future, now)).toBe("방금");
  });
  it("자정 직후에는 어제 저녁 수정이 하루 전으로 (날짜 기준 의미론)", () => {
    // 오프셋 없는 로컬 시각 문자열 — 테스트 실행 타임존과 무관하게 성립
    const midnight = new Date("2026-08-06T00:05:00");
    expect(relativeTime("2026-08-05T23:55:00", midnight)).toBe("하루 전");
  });
});

describe("fontStack custom", () => {
  it("프리셋이 아닌 값은 설치 폰트명으로 취급해 스택 맨 앞에 둔다", () => {
    const s = fontStack("JetBrains Mono");
    expect(s.startsWith('"JetBrains Mono"')).toBe(true);
    expect(s).toContain("Malgun Gothic");
  });
  it("자유 입력의 따옴표는 걷어내 CSS가 깨지지 않게 한다", () => {
    expect(fontStack('My "Weird" Font')).toBe('"My Weird Font", "Malgun Gothic", sans-serif');
  });
});

describe("plainPreview", () => {
  it("마크다운 기호를 걷어낸 플레인 텍스트", () => {
    expect(plainPreview("# 제목\n**굵게** 본문")).toBe("제목\n굵게 본문");
  });
  it("체크박스는 ☐/☑로, 불렛은 •로", () => {
    expect(plainPreview("- [ ] 할일\n- [x] 완료\n- 항목")).toBe("☐ 할일\n☑ 완료\n• 항목");
  });
  it("이미지는 제거, 링크는 텍스트만", () => {
    expect(plainPreview("![](assets/a/b.png)\n[문서](https://x.y)")).toBe("문서");
  });
  it("중첩 체크박스는 들여쓰기를 유지한다", () => {
    expect(plainPreview("- [ ] 상위\n  - [x] 하위")).toBe("☐ 상위\n  ☑ 하위");
  });
  it("인용 기호 제거, 빈 줄 정리", () => {
    expect(plainPreview("> 인용문\n\n\n다음 문단")).toBe("인용문\n다음 문단");
  });
});
