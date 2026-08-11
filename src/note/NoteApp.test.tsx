import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

type MovedCb = (e: { payload: { x: number; y: number } }) => void;

vi.mock("@tauri-apps/api/window", () => {
  const win = {
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    scaleFactor: vi.fn().mockResolvedValue(1),
    outerPosition: vi.fn().mockResolvedValue({ toLogical: () => ({ x: 0, y: 0 }) }),
    innerSize: vi.fn().mockResolvedValue({ toLogical: () => ({ width: 320, height: 340 }) }),
    onMoved: vi.fn().mockImplementation((cb: MovedCb) => {
      (win as { movedCb?: MovedCb }).movedCb = cb;
      return Promise.resolve(() => {});
    }),
    onResized: vi.fn().mockResolvedValue(() => {}),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
    listen: vi.fn().mockImplementation((name: string, cb: (e: { payload: unknown }) => void) => {
      const w = win as { events?: Record<string, (e: { payload: unknown }) => void> };
      w.events = { ...(w.events ?? {}), [name]: cb };
      return Promise.resolve(() => {});
    }),
    movedCb: undefined as MovedCb | undefined,
    events: undefined as Record<string, (e: { payload: unknown }) => void> | undefined,
  };
  return { getCurrentWindow: () => win, __win: win };
});
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock("../lib/api", () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  openList: vi.fn(),
  saveBody: vi.fn(),
  saveMeta: vi.fn(),
  saveImage: vi.fn(),
  importImage: vi.fn(),
  dataRoot: vi.fn(),
  revealNote: vi.fn(),
  groupMembers: vi.fn(),
  navGroup: vi.fn(),
  navTo: vi.fn(),
  popOut: vi.fn(),
  checkMerge: vi.fn(),
  mergePreview: vi.fn(),
  setLastViewed: vi.fn(),
}));

import * as api from "../lib/api";
import type { Note, NoteMeta } from "../lib/api";
import * as winMod from "@tauri-apps/api/window";
import NoteApp from "./NoteApp";

const win = (
  winMod as unknown as {
    __win: Record<string, ReturnType<typeof vi.fn>> & {
      movedCb?: MovedCb;
      events?: Record<string, (e: { payload: unknown }) => void>;
    };
  }
).__win;

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

const setupNote = (note: Note, members: string[] = []) => {
  vi.mocked(api.listNotes).mockResolvedValue([note]);
  vi.mocked(api.dataRoot).mockResolvedValue("C:/data/Ddakji");
  vi.mocked(api.saveBody).mockResolvedValue(note);
  vi.mocked(api.saveMeta).mockResolvedValue(note);
  vi.mocked(api.groupMembers).mockResolvedValue(members);
  vi.mocked(api.checkMerge).mockResolvedValue(false);
  vi.mocked(api.mergePreview).mockResolvedValue(false);
  vi.mocked(api.setLastViewed).mockResolvedValue(undefined);
  vi.mocked(api.popOut).mockResolvedValue(null);
};

beforeEach(() => {
  vi.clearAllMocks();
  win.movedCb = undefined;
  win.events = undefined;
});
afterEach(cleanup);

describe("NoteApp 그룹 UI", () => {
  it("무소속 노트에는 내비 화살표·위치 카운터가 없다", async () => {
    setupNote(mkNote("n1", "혼자 있는 노트"));
    const { container } = render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    expect(screen.queryByTitle("이전 노트 (Alt+←)")).toBeNull();
    expect(container.querySelector(".stack-count")).toBeNull();
  });

  it("모음집 노트에는 좌우 화살표와 현재 위치 카운터", async () => {
    setupNote(mkNote("n1", "그룹 노트", { group: "모음" }), ["n1", "n2", "n3"]);
    const { container } = render(<NoteApp noteId="n1" />);
    await screen.findByTitle("다음 노트 (Alt+→)");
    expect(screen.getByTitle("이전 노트 (Alt+←)")).toBeTruthy();
    expect(container.querySelector(".stack-count")?.textContent).toBe("1 / 3");
  });

  it("오른쪽 화살표는 다음 노트로 이동을 요청한다", async () => {
    setupNote(mkNote("n1", "그룹 노트", { group: "모음" }), ["n1", "n2"]);
    vi.mocked(api.navGroup).mockResolvedValue(null); // 다른 창에 열려 있어 포커스만 이동한 경우
    render(<NoteApp noteId="n1" />);
    fireEvent.click(await screen.findByTitle("다음 노트 (Alt+→)"));
    await waitFor(() => expect(api.navGroup).toHaveBeenCalledWith(1));
  });

  it("이동하면 에디터가 다음 노트의 본문을 보여준다 (#74 stale body 회귀)", async () => {
    const cur = mkNote("n1", "첫 번째 본문", { group: "모음" });
    const next = mkNote("n2", "두 번째 본문", { group: "모음", group_order: 1 });
    setupNote(cur, ["n1", "n2"]);
    vi.mocked(api.listNotes).mockResolvedValue([cur, next]);
    vi.mocked(api.navGroup).mockResolvedValue(next);
    render(<NoteApp noteId="n1" />);
    fireEvent.click(await screen.findByTitle("다음 노트 (Alt+→)"));
    await screen.findByText("두 번째 본문");
  });
});

describe("NoteApp 좀비 창 방지 (NOTE_NOT_FOUND)", () => {
  it("파일이 밖에서 삭제되면 저장 실패 시 창을 파괴한다", async () => {
    setupNote(mkNote("n1", "본문"));
    vi.mocked(api.saveBody).mockRejectedValue("NOTE_NOT_FOUND");
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent(window, new Event("blur")); // 포커스 아웃 → 본문 플러시
    await waitFor(() => expect(win.destroy).toHaveBeenCalled());
  });

  it("일반 저장 실패는 창을 닫지 않고 재시도 배너를 띄운다", async () => {
    setupNote(mkNote("n1", "본문"));
    vi.mocked(api.saveBody).mockRejectedValue("disk full");
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent(window, new Event("blur"));
    await screen.findByText(/저장 실패/);
    expect(win.destroy).not.toHaveBeenCalled();
  });
});

describe("NoteApp 드래그 병합 게이트", () => {
  // 회귀(#25 G4): 연속 이벤트 간 거리로 판정하면 드래그 중 델타가 30px를
  // 넘지 않아 병합이 아예 발동하지 않았다 — 누적 이동 거리로 판정해야 한다.
  const drag = (points: [number, number][]) => {
    act(() => {
      for (const [x, y] of points) win.movedCb?.({ payload: { x, y } });
    });
  };

  it("누적 30px 이하의 이동은 병합을 검사하지 않는다", async () => {
    setupNote(mkNote("n1", "본문"));
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.movedCb).toBeTruthy());
    drag([
      [100, 100],
      [110, 100],
      [120, 100],
    ]); // 누적 20px
    await waitFor(() => expect(api.saveMeta).toHaveBeenCalled(), { timeout: 1500 });
    expect(api.checkMerge).not.toHaveBeenCalled();
  });

  it("작은 델타라도 누적 30px를 넘으면 병합을 검사한다", async () => {
    setupNote(mkNote("n1", "본문"));
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.movedCb).toBeTruthy());
    // 이벤트당 10px씩 — 연속 델타 판정이라면 절대 30px를 못 넘는 패턴
    drag([
      [100, 100],
      [110, 100],
      [120, 100],
      [130, 100],
      [140, 100],
    ]); // 누적 40px
    await waitFor(() => expect(api.checkMerge).toHaveBeenCalled(), { timeout: 1500 });
  });
});

describe("NoteApp 팝아웃 (#74)", () => {
  it("현재 메모를 꺼내면 이 창은 반환된 다음 멤버를 표시한다", async () => {
    const cur = mkNote("n1", "현재 메모", { group: "모음" });
    const next = mkNote("n2", "다음 메모 내용", { group: "모음", group_order: 1 });
    setupNote(cur, ["n1", "n2"]);
    vi.mocked(api.listNotes).mockResolvedValue([cur, next]);
    vi.mocked(api.popOut).mockResolvedValue(next);
    render(<NoteApp noteId="n1" />);
    fireEvent.click(await screen.findByTitle("모음집에서 꺼내기 (Ctrl+Shift+P)"));
    await waitFor(() => expect(api.popOut).toHaveBeenCalled());
    // 같은 메모가 두 창에 남지 않도록, 기존 창이 다음 멤버로 넘어간다
    await screen.findByText("다음 메모 내용");
  });

  it("전환할 멤버가 없으면(None) 이 창은 그대로", async () => {
    const cur = mkNote("n1", "현재 메모", { group: "모음" });
    setupNote(cur, ["n1", "n2"]);
    vi.mocked(api.popOut).mockResolvedValue(null);
    render(<NoteApp noteId="n1" />);
    fireEvent.click(await screen.findByTitle("모음집에서 꺼내기 (Ctrl+Shift+P)"));
    await waitFor(() => expect(api.popOut).toHaveBeenCalled());
    expect(screen.getByText("현재 메모")).toBeTruthy();
  });
});

describe("NoteApp 창 전환 이벤트 (#77 룰4)", () => {
  it("switch-note 이벤트를 받으면 이 창이 그 노트로 전환된다", async () => {
    // 목록에서 모음집 멤버를 열면 백엔드가 새 창 대신 모음집 창을 전환시킨다
    const cur = mkNote("n1", "모음집 창 본문", { group: "모음" });
    const other = mkNote("n2", "전환된 멤버 본문", { group: "모음", group_order: 1 });
    setupNote(cur, ["n1", "n2"]);
    vi.mocked(api.listNotes).mockResolvedValue([cur, other]);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.events?.["switch-note"]).toBeTruthy());
    act(() => win.events!["switch-note"]({ payload: other }));
    await screen.findByText("전환된 멤버 본문");
  });
});

describe("NoteApp 외부 변경 리로드 (#12)", () => {
  it("note-updated 이벤트를 받으면 에디터 본문이 교체된다", async () => {
    // CLI 등 밖에서 바뀐 파일 → 브리지가 이 창으로 note-updated를 보낸다
    setupNote(mkNote("n1", "원래 본문"));
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.events?.["note-updated"]).toBeTruthy());
    act(() => win.events!["note-updated"]({ payload: mkNote("n1", "CLI가 바꾼 본문") }));
    await screen.findByText("CLI가 바꾼 본문");
  });

  it("다른 노트에 대한 이벤트는 무시한다", async () => {
    setupNote(mkNote("n1", "내 본문"));
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.events?.["note-updated"]).toBeTruthy());
    act(() => win.events!["note-updated"]({ payload: mkNote("n2", "남의 본문") }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("남의 본문")).toBeNull();
    expect(screen.getByText("내 본문")).toBeTruthy();
  });
});

describe("NoteApp 뒷면 (딱지 시안)", () => {
  it("빗금 그립을 누르면 뒷면 정보가 나오고, 다시 누르면 앞면으로 돌아온다", async () => {
    setupNote(mkNote("n1", "앞면 본문", { group: "모음" }), ["n1", "n2"]);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("뒷면 정보"));
    expect(screen.getByText("만든 날")).toBeTruthy();
    expect(screen.getByText("모음")).toBeTruthy();
    expect(screen.getByText("n1.md")).toBeTruthy();
    // 뒷면에서는 넘기기 화살표가 숨는다
    expect(screen.queryByTitle("다음 노트 (Alt+→)")).toBeNull();
    fireEvent.click(screen.getByTitle("앞면으로"));
    await screen.findByText("앞면 본문");
  });

  it("뒷면의 파일 위치 열기는 revealNote를 부른다", async () => {
    setupNote(mkNote("n1", "본문"));
    vi.mocked(api.revealNote).mockResolvedValue(undefined);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("뒷면 정보"));
    fireEvent.click(screen.getByText("파일 위치 열기"));
    expect(api.revealNote).toHaveBeenCalledWith("n1");
  });

  it("뒷면의 삭제는 확인 후 deleteNote를 부른다", async () => {
    setupNote(mkNote("n1", "본문"));
    const { ask } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(api.deleteNote).mockResolvedValue(undefined);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("뒷면 정보"));
    fireEvent.click(screen.getByText("삭제"));
    await waitFor(() => expect(api.deleteNote).toHaveBeenCalledWith("n1"));
  });
});

describe("NoteApp 단축키", () => {
  it("Ctrl+N은 새 노트, Ctrl+L은 목록", async () => {
    setupNote(mkNote("n1", "본문"));
    vi.mocked(api.createNote).mockResolvedValue(mkNote("n2", ""));
    vi.mocked(api.openList).mockResolvedValue(undefined);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(api.createNote).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    expect(api.openList).toHaveBeenCalled();
  });
});
