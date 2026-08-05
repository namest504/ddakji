import { describe, expect, it } from "vitest";
import { clampFontSize, filterNotes, hasMoreBelow, initialViewerMode, noteTitle } from "./noteUtils";
import type { Note } from "./api";

const note = (id: string, body: string): Note => ({
  meta: {
    id, created_at: "", updated_at: "", color: "yellow", font_size: 16,
    viewer_mode: false, window: { x: 0, y: 0, w: 320, h: 340 },
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
