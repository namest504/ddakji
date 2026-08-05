import { describe, expect, it } from "vitest";
import { clampFontSize, filterNotes, fontStack, hasMoreBelow, initialViewerMode, noteTitle, relativeTime } from "./noteUtils";
import type { Note } from "./api";

const note = (id: string, body: string): Note => ({
  meta: {
    id, created_at: "", updated_at: "", color: "yellow", font_size: 16,
    font_family: "system", viewer_mode: false, window: { x: 0, y: 0, w: 320, h: 340 },
    always_on_top: false, hidden: false,
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
});

describe("noteTitle", () => {
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
});

describe("initialViewerMode", () => {
  it("본문이 있으면 뷰어로 연다", () => {
    expect(initialViewerMode("내용")).toBe(true);
  });
  it("본문이 비어 있으면 편집 모드로 연다 (뷰어는 보여줄 게 없음)", () => {
    expect(initialViewerMode("")).toBe(false);
    expect(initialViewerMode("  \n ")).toBe(false);
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
  it("오늘이면 시각으로", () => {
    const t = "2026-08-05T14:10:00+09:00";
    const expected = new Date(t).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
    expect(relativeTime(t, now)).toBe(expected);
  });
  it("어제면 '어제'", () => {
    expect(relativeTime("2026-08-04T23:59:00+09:00", now)).toBe("어제");
  });
  it("그 이전이면 월/일", () => {
    expect(relativeTime("2026-07-30T10:00:00+09:00", now)).toBe("7/30");
  });
  it("파싱 불가면 빈 문자열", () => {
    expect(relativeTime("", now)).toBe("");
  });
});

describe("fontStack custom", () => {
  it("프리셋이 아닌 값은 설치 폰트명으로 취급해 스택 맨 앞에 둔다", () => {
    const s = fontStack("JetBrains Mono");
    expect(s.startsWith('"JetBrains Mono"')).toBe(true);
    expect(s).toContain("Malgun Gothic");
  });
});
