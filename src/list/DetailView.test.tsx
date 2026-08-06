import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/api", () => ({
  listNotes: vi.fn(),
  openNote: vi.fn(),
  saveMeta: vi.fn(),
}));

import * as api from "../lib/api";
import type { Note, NoteMeta } from "../lib/api";
import DetailView from "./DetailView";

// 시각은 오프셋 없는 로컬 시간 문자열 — fullDateTime이 로컬 기준으로 포맷하므로
// 테스트가 실행 타임존(CI는 UTC)과 무관하게 성립한다
const mkNote = (id: string, body: string, extra: Partial<NoteMeta> = {}): Note => ({
  meta: {
    id, created_at: "2026-08-01T10:00:00", updated_at: "2026-08-02T14:30:00",
    color: "yellow", font_size: 16, font_family: "system", viewer_mode: false,
    window: { x: 0, y: 0, w: 320, h: 340 }, always_on_top: false, hidden: false,
    group_order: 0, ...extra,
  },
  body,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DetailView", () => {
  it("제목 입력의 placeholder는 본문 파생 제목, 메타 정보 표시", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "# 본문 제목\n내용")]);
    render(<DetailView noteId="a" onBack={() => {}} />);
    await screen.findByPlaceholderText("본문 제목");
    expect(screen.getByText("2026.08.01 10:00")).toBeTruthy(); // 만든 날짜
    expect(screen.getByText("없음")).toBeTruthy(); // 모음집 없음
    expect(screen.getByText("a.md")).toBeTruthy(); // 파일명
  });

  it("제목을 입력하고 벗어나면 저장된다", async () => {
    const note = mkNote("a", "본문");
    vi.mocked(api.listNotes).mockResolvedValue([note]);
    const saved = mkNote("a", "본문", { title: "새 제목" });
    vi.mocked(api.saveMeta).mockResolvedValue(saved);
    render(<DetailView noteId="a" onBack={() => {}} />);
    const input = await screen.findByPlaceholderText("본문");
    fireEvent.change(input, { target: { value: "  새 제목  " } });
    fireEvent.blur(input);
    // 공백은 정리되어 저장된다
    await waitFor(() => expect(api.saveMeta).toHaveBeenCalledWith("a", { title: "새 제목" }));
  });

  it("노트 열기 행은 해당 노트를 연다", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "본문")]);
    vi.mocked(api.openNote).mockResolvedValue(undefined);
    render(<DetailView noteId="a" onBack={() => {}} />);
    fireEvent.click(await screen.findByText("노트 열기"));
    expect(api.openNote).toHaveBeenCalledWith("a");
  });
});
