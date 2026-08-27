import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../lib/api", () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  openNote: vi.fn(),
  saveMeta: vi.fn(),
  renameGroup: vi.fn(),
  exeKind: vi.fn(),
  getSettings: vi.fn(),
  importMarkdown: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: () => Promise.resolve(),
    setFocus: () => Promise.resolve(),
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import * as api from "../lib/api";
import type { Note, NoteMeta } from "../lib/api";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import ListApp from "./ListApp";

const mkNote = (id: string, body: string, extra: Partial<NoteMeta> = {}): Note => ({
  meta: {
    id,
    created_at: "2026-08-01T10:00:00+09:00",
    updated_at: "2026-08-01T10:00:00+09:00",
    color: "yellow",
    font_size: 16,
    font_family: "system",
    viewer_mode: false,
    window: { x: 0, y: 0, w: 320, h: 340 },
    always_on_top: false,
    hidden: false,
    group_order: 0,
    ...extra,
  },
  body,
});

const rowTitles = (el: HTMLElement) =>
  [...el.querySelectorAll(".list-row .title")].map((n) => n.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listNotes).mockResolvedValue([]);
  vi.mocked(api.exeKind).mockResolvedValue("installed");
  vi.mocked(check).mockResolvedValue(null);
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

describe("ListApp 마크다운 가져오기 (#72)", () => {
  it("여러 파일을 고르면 각각 노트로 가져온다", async () => {
    render(<ListApp />);
    await screen.findByText("노트가 없습니다. ＋로 시작하세요.");
    vi.mocked(open).mockResolvedValue(["C:/docs/a.md", "C:/docs/b.md"]);
    vi.mocked(api.importMarkdown).mockResolvedValue(mkNote("x", "# 가져온 노트"));
    fireEvent.click(screen.getByTitle("마크다운 가져오기"));
    await waitFor(() => expect(api.importMarkdown).toHaveBeenCalledTimes(2));
    expect(api.importMarkdown).toHaveBeenCalledWith("C:/docs/a.md");
    expect(api.importMarkdown).toHaveBeenCalledWith("C:/docs/b.md");
  });

  it("파일 선택을 취소하면 아무 일도 없다", async () => {
    render(<ListApp />);
    await screen.findByText("노트가 없습니다. ＋로 시작하세요.");
    vi.mocked(open).mockResolvedValue(null);
    fireEvent.click(screen.getByTitle("마크다운 가져오기"));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(api.importMarkdown).not.toHaveBeenCalled();
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

describe("ListApp 모음집 이름 바꾸기 (#139)", () => {
  const twoGroups = () => {
    vi.mocked(api.listNotes).mockResolvedValue([
      mkNote("a", "하나-1", { group: "데일리" }),
      mkNote("b", "하나-2", { group: "데일리", group_order: 1 }),
      mkNote("c", "둘-1", { group: "업무" }),
      mkNote("d", "둘-2", { group: "업무", group_order: 1 }),
    ]);
  };

  it("그룹 헤더의 이름 바꾸기로 renameGroup을 부른다", async () => {
    twoGroups();
    vi.mocked(api.renameGroup).mockResolvedValue(2);
    render(<ListApp />);
    await screen.findByText("데일리");
    fireEvent.click(screen.getAllByTitle("이름 바꾸기")[0]);
    const input = screen.getByDisplayValue("데일리");
    fireEvent.change(input, { target: { value: "아침루틴" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.renameGroup).toHaveBeenCalledWith("데일리", "아침루틴"));
    // 확정되면 입력은 닫힌다
    await waitFor(() => expect(screen.queryByDisplayValue("아침루틴")).toBeNull());
  });

  it("겹치는 이름은 거부 안내를 보여 주고 입력을 유지한다", async () => {
    twoGroups();
    vi.mocked(api.renameGroup).mockRejectedValue("같은 이름의 모음집이 있습니다");
    render(<ListApp />);
    await screen.findByText("데일리");
    fireEvent.click(screen.getAllByTitle("이름 바꾸기")[0]);
    const input = screen.getByDisplayValue("데일리");
    fireEvent.change(input, { target: { value: "업무" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("같은 이름의 모음집이 있습니다");
    // 입력은 열린 채 — 사용자가 고쳐서 다시 시도할 수 있게
    expect(screen.getByDisplayValue("업무")).toBeTruthy();
  });

  it("Esc는 바꾸지 않고 닫는다", async () => {
    twoGroups();
    render(<ListApp />);
    await screen.findByText("데일리");
    fireEvent.click(screen.getAllByTitle("이름 바꾸기")[0]);
    const input = screen.getByDisplayValue("데일리");
    fireEvent.change(input, { target: { value: "버릴이름" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(api.renameGroup).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("버릴이름")).toBeNull();
    expect(screen.getByText("데일리")).toBeTruthy();
  });
});

describe("ListApp 업데이트 (#141)", () => {
  const update = (v: string) =>
    ({ version: v, downloadAndInstall: vi.fn().mockResolvedValue(undefined) }) as never;

  it("새 버전이 없으면 버튼도 없다", async () => {
    render(<ListApp />);
    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(screen.queryByText(/업데이트/)).toBeNull();
  });

  it("새 버전이 있으면 버튼이 뜨고, 누르면 설치·재시작한다", async () => {
    const u = update("9.9.9");
    vi.mocked(check).mockResolvedValue(u);
    render(<ListApp />);
    const btn = await screen.findByText("v9.9.9 업데이트");
    fireEvent.click(btn);
    await waitFor(() =>
      expect((u as { downloadAndInstall: unknown }).downloadAndInstall).toHaveBeenCalled(),
    );
    await waitFor(() => expect(relaunch).toHaveBeenCalled());
  });

  it("포터블 실행이면 설치 대신 릴리스 페이지를 연다", async () => {
    vi.mocked(api.exeKind).mockResolvedValue("portable");
    const u = update("9.9.9");
    vi.mocked(check).mockResolvedValue(u);
    render(<ListApp />);
    const btn = await screen.findByText("v9.9.9 업데이트");
    fireEvent.click(btn);
    await waitFor(() =>
      expect(openUrl).toHaveBeenCalledWith("https://github.com/namest504/ddakji/releases/latest"),
    );
    expect(
      (u as { downloadAndInstall: unknown }).downloadAndInstall as never,
    ).not.toHaveBeenCalled();
  });

  it("확인 실패는 조용히 넘어간다 — 다음 시작 때 다시", async () => {
    vi.mocked(check).mockRejectedValue(new Error("offline"));
    render(<ListApp />);
    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(screen.queryByText(/업데이트/)).toBeNull();
  });
});

describe("ListApp 언어 설정 (#143)", () => {
  it("설정이 en이면 UI가 영어로 렌더된다", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({
      default_color: "yellow",
      default_font_family: "system",
      default_font_size: 16,
      favorite_fonts: [],
      theme: "system",
      language: "en",
    });
    const { I18nProvider } = await import("../lib/i18n");
    render(
      <I18nProvider>
        <ListApp />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText("Search")).toBeTruthy());
    expect(screen.getByTitle("New note")).toBeTruthy();
  });
});

describe("ListApp 숨김 표시 (#153)", () => {
  it("숨긴 노트는 흐려지고 숨김 칩이 붙는다", async () => {
    vi.mocked(api.listNotes).mockResolvedValue([
      mkNote("a", "보이는 노트"),
      mkNote("b", "숨긴 노트", { hidden: true }),
    ]);
    const { container } = render(<ListApp />);
    await screen.findByText("숨긴 노트");
    const rows = container.querySelectorAll(".list-row");
    expect(rows[0].className).not.toContain("row-hidden");
    expect(rows[1].className).toContain("row-hidden");
    expect(screen.getByText("숨김")).toBeTruthy();
    // 보이는 노트에는 칩이 없다
    expect(screen.getAllByText("숨김")).toHaveLength(1);
  });
});
