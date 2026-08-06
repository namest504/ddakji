import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../lib/api", () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  openNote: vi.fn(),
  saveMeta: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: () => Promise.resolve(),
    setFocus: () => Promise.resolve(),
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }));

import * as api from "../lib/api";
import type { Note, NoteMeta } from "../lib/api";
import { ask } from "@tauri-apps/plugin-dialog";
import ListApp from "./ListApp";

const mkNote = (id: string, body: string, extra: Partial<NoteMeta> = {}): Note => ({
  meta: {
    id, created_at: "2026-08-01T10:00:00+09:00", updated_at: "2026-08-01T10:00:00+09:00",
    color: "yellow", font_size: 16, font_family: "system", viewer_mode: false,
    window: { x: 0, y: 0, w: 320, h: 340 }, always_on_top: false, hidden: false,
    group_order: 0, ...extra,
  },
  body,
});

const rowTitles = (el: HTMLElement) =>
  [...el.querySelectorAll(".list-row .title")].map((n) => n.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listNotes).mockResolvedValue([]);
});
afterEach(cleanup);

describe("ListApp 그룹 섹션", () => {
  it("모음집은 group_order 순으로 섹션에, 무소속은 '노트' 섹션 뒤에", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([
      mkNote("loose", "자유 노트"),
      mkNote("gb", "업무 둘째", { group: "업무", group_order: 1 }),
      mkNote("ga", "업무 첫째", { group: "업무", group_order: 0 }),
    ]);
    const { container } = render(<ListApp />);
    await screen.findByText("업무");
    expect(screen.getByText("노트")).toBeTruthy();
    expect(rowTitles(container)).toEqual(["업무 첫째", "업무 둘째", "자유 노트"]);
  });

  it("노트가 없으면 빈 상태 안내", async () => {
    render(<ListApp />);
    await screen.findByText("노트가 없습니다. ＋로 시작하세요.");
  });
});

describe("ListApp 검색", () => {
  it("사용자 지정 제목으로 검색되고, 없는 말은 빈 상태 (#67)", async () => {
    const titled = mkNote("a", "본문에는 다른 이야기");
    titled.meta.title = "주간 회의록";
    vi.mocked(api.listNotes).mockResolvedValue([titled]);
    render(<ListApp />);
    await screen.findByText("주간 회의록");
    const input = screen.getByPlaceholderText("검색");
    fireEvent.change(input, { target: { value: "회의록" } });
    expect(screen.getByText("주간 회의록")).toBeTruthy();
    fireEvent.change(input, { target: { value: "존재하지않는말" } });
    expect(screen.queryByText("주간 회의록")).toBeNull();
    expect(screen.getByText("노트가 없습니다. ＋로 시작하세요.")).toBeTruthy();
  });
});

describe("ListApp 행 동작", () => {
  it("행 클릭은 노트를 연다", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "장보기")]);
    vi.mocked(api.openNote).mockResolvedValue(undefined);
    render(<ListApp />);
    fireEvent.click(await screen.findByText("장보기"));
    expect(api.openNote).toHaveBeenCalledWith("a");
  });

  it("삭제는 확인 다이얼로그를 거친다 — 취소하면 지우지 않는다", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "장보기")]);
    render(<ListApp />);
    const row = (await screen.findByText("장보기")).closest(".list-row") as HTMLElement;

    vi.mocked(ask).mockResolvedValue(false);
    fireEvent.click(within(row).getByTitle("삭제"));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(api.deleteNote).not.toHaveBeenCalled();

    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(api.deleteNote).mockResolvedValue(undefined);
    fireEvent.click(within(row).getByTitle("삭제"));
    await waitFor(() => expect(api.deleteNote).toHaveBeenCalledWith("a"));
  });

  it("자세히 보기 버튼은 상세 화면으로 (행 클릭과 분리)", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "장보기")]);
    render(<ListApp />);
    const row = (await screen.findByText("장보기")).closest(".list-row") as HTMLElement;
    fireEvent.click(within(row).getByTitle("자세히 보기"));
    await screen.findByText("자세히 보기");
    expect(api.openNote).not.toHaveBeenCalled();
  });
});

describe("ListApp 선택 모드 (모음집 묶기)", () => {
  it("선택한 노트들에 그룹 이름을 적용한다", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "첫째"), mkNote("b", "둘째")]);
    vi.mocked(api.saveMeta).mockImplementation((id) => Promise.resolve(mkNote(id, "")));
    render(<ListApp />);
    await screen.findByText("첫째");
    fireEvent.click(screen.getByTitle("선택해서 모음집으로 묶기"));
    expect(screen.getByText("묶을 노트를 선택하세요")).toBeTruthy();
    fireEvent.click(screen.getByText("첫째"));
    fireEvent.click(screen.getByText("둘째"));
    const nameInput = screen.getByPlaceholderText("모음집 이름 (Enter)");
    fireEvent.change(nameInput, { target: { value: "새모음" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    await waitFor(() => expect(api.saveMeta).toHaveBeenCalledTimes(2));
    expect(api.saveMeta).toHaveBeenCalledWith("a", { group: "새모음" });
    expect(api.saveMeta).toHaveBeenCalledWith("b", { group: "새모음" });
    // 선택 모드에서는 행 클릭이 노트를 열지 않는다
    expect(api.openNote).not.toHaveBeenCalled();
  });

  it("해제 버튼은 빈 그룹으로 저장한다 (그룹 해제 의미론)", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([mkNote("a", "첫째", { group: "업무" })]);
    vi.mocked(api.saveMeta).mockImplementation((id) => Promise.resolve(mkNote(id, "")));
    render(<ListApp />);
    await screen.findByText("첫째");
    fireEvent.click(screen.getByTitle("선택해서 모음집으로 묶기"));
    fireEvent.click(screen.getByText("첫째"));
    fireEvent.click(screen.getByText("해제"));
    await waitFor(() => expect(api.saveMeta).toHaveBeenCalledWith("a", { group: "" }));
  });
});
