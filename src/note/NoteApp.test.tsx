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
  hideNote: vi.fn(),
  hideGroup: vi.fn(),
  groupMembers: vi.fn(),
  navGroup: vi.fn(),
  navTo: vi.fn(),
  popOut: vi.fn(),
  checkMerge: vi.fn(),
  undoMerge: vi.fn(),
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
  vi.mocked(api.hideNote).mockResolvedValue(null);
  vi.mocked(api.hideGroup).mockResolvedValue(undefined);
};

beforeEach(() => {
  vi.clearAllMocks();
  win.movedCb = undefined;
  win.events = undefined;
});
afterEach(cleanup);

describe("NoteApp 그룹 UI", () => {
  it("무소속 노트에는 내비 화살표·점이 없다", async () => {
    setupNote(mkNote("n1", "혼자 있는 노트"));
    const { container } = render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    expect(screen.queryByTitle("이전 노트 (Alt+←)")).toBeNull();
    expect(container.querySelector(".group-dots")).toBeNull();
  });

  it("모음집 노트에는 좌우 화살표와 멤버 수만큼의 점, 현재 위치 표시", async () => {
    setupNote(mkNote("n1", "그룹 노트", { group: "모음" }), ["n1", "n2", "n3"]);
    const { container } = render(<NoteApp noteId="n1" />);
    await screen.findByTitle("다음 노트 (Alt+→)");
    expect(screen.getByTitle("이전 노트 (Alt+←)")).toBeTruthy();
    const dots = container.querySelectorAll(".group-dots button");
    expect(dots).toHaveLength(3);
    expect(dots[0].className).toContain("active");
    expect(dots[1].className).not.toContain("active");
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

  it("모음집에서 뒷면 삭제 후 넘겨받은 장은 앞면으로 보인다", async () => {
    // 회귀: 삭제하면 창이 파괴돼 모음집 전체가 사라졌다. 이제 창은 다음 장으로
    // 넘어오는데, 뒤집힌 상태가 남아 남의 뒷면부터 보이면 안 된다.
    const cur = mkNote("n1", "지울 장", { group: "모음" });
    const next = mkNote("n2", "남는 장 본문", { group: "모음", group_order: 1 });
    setupNote(cur, ["n1", "n2"]);
    vi.mocked(api.listNotes).mockResolvedValue([cur, next]);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.events?.["switch-note"]).toBeTruthy());
    fireEvent.click(screen.getByTitle("뒷면 정보"));
    expect(screen.getByText("만든 날")).toBeTruthy();
    // 백엔드가 삭제 후 이 창을 다음 멤버로 넘긴다
    act(() => win.events!["switch-note"]({ payload: next }));
    await screen.findByText("남는 장 본문");
    expect(screen.queryByText("만든 날")).toBeNull();
    expect(win.destroy).not.toHaveBeenCalled();
  });
});

describe("NoteApp 합치기 되돌리기 (#115)", () => {
  it("다른 창을 흡수하면 되돌리기 안내가 뜨고, 누르면 되돌린다", async () => {
    setupNote(mkNote("n1", "본문"));
    vi.mocked(api.undoMerge).mockResolvedValue(true);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.events?.["merged-in"]).toBeTruthy());
    expect(screen.queryByText("되돌리기")).toBeNull();
    act(() => win.events!["merged-in"]({ payload: null }));
    await screen.findByText(/합쳤습니다/);
    fireEvent.click(screen.getByText("되돌리기"));
    await waitFor(() => expect(api.undoMerge).toHaveBeenCalled());
    // 누른 즉시 안내는 걷힌다 — 같은 것을 두 번 되돌릴 일은 없다
    await waitFor(() => expect(screen.queryByText("되돌리기")).toBeNull());
  });

  it("드래그 판정이 진행 중이면 다시 부르지 않는다", async () => {
    // checkMerge는 마우스를 놓을 때까지 돌아오지 않는다(#115) — 그 사이 창이
    // 더 움직여 저장이 다시 돌아도 판정이 겹쳐 쌓이면 안 된다
    setupNote(mkNote("n1", "본문"));
    let resolve: ((v: boolean) => void) | undefined;
    vi.mocked(api.checkMerge).mockReturnValue(
      new Promise<boolean>((r) => {
        resolve = r;
      }),
    );
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.movedCb).toBeTruthy());
    const drag = (n: number) => {
      act(() => {
        for (let i = 0; i < n; i++) win.movedCb?.({ payload: { x: 100 + i * 20, y: 100 } });
      });
    };
    drag(5);
    await waitFor(() => expect(api.checkMerge).toHaveBeenCalledTimes(1), { timeout: 2000 });
    drag(5); // 대기 중 추가 이동
    await new Promise((r) => setTimeout(r, 900));
    expect(api.checkMerge).toHaveBeenCalledTimes(1);
    resolve?.(false);
  });
});

describe("NoteApp 숨기기 두 갈래", () => {
  it("모음집에서 Ctrl+W는 이 장만 숨기고 창은 다음 장을 보여 준다", async () => {
    const cur = mkNote("n1", "이 장 본문", { group: "모음" });
    const next = mkNote("n2", "다음 장 본문", { group: "모음", group_order: 1 });
    setupNote(cur, ["n1", "n2"]);
    vi.mocked(api.listNotes).mockResolvedValue([cur, next]);
    vi.mocked(api.hideNote).mockResolvedValue(next);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    await waitFor(() => expect(api.hideNote).toHaveBeenCalled());
    await screen.findByText("다음 장 본문");
    expect(win.close).not.toHaveBeenCalled();
  });

  it("전환할 장이 없으면 Ctrl+W는 창까지 내린다", async () => {
    setupNote(mkNote("n1", "혼자 있는 노트"));
    vi.mocked(api.hideNote).mockResolvedValue(null);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    await waitFor(() => expect(win.close).toHaveBeenCalled());
  });

  it("Ctrl+Shift+W는 모음집 전체를 숨기고 창을 내린다", async () => {
    setupNote(mkNote("n1", "그룹 노트", { group: "모음" }), ["n1", "n2"]);
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "w", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(api.hideGroup).toHaveBeenCalled());
    await waitFor(() => expect(win.close).toHaveBeenCalled());
    expect(api.hideNote).not.toHaveBeenCalled();
  });

  it("툴바의 '이 장만 숨기기'는 모음집일 때만 있다", async () => {
    setupNote(mkNote("n1", "혼자 있는 노트"));
    const solo = render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    expect(screen.queryByTitle(/이 장만 숨기기/)).toBeNull();
    solo.unmount();

    setupNote(mkNote("n2", "그룹 노트", { group: "모음" }), ["n2", "n3"]);
    render(<NoteApp noteId="n2" />);
    await screen.findByTitle(/이 장만 숨기기/);
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

// 데이터 유실 회귀 (#120): bodyRef가 초기 로드에서 채워지지 않아, 한 글자도 치지
// 않은 노트를 플러시하면 빈 본문이 파일을 덮어썼다. 목이 호출 여부만 보고 있어
// 테스트가 이 경로를 매번 지나면서도 놓쳤다 — 이제 인자를 못박는다.
describe("NoteApp 본문 보존 (#120)", () => {
  it("타이핑 없이 뒷면을 열어도 원래 본문이 그대로 저장된다", async () => {
    setupNote(mkNote("n1", "지워지면 안 되는 본문"));
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle("뒷면 정보"));
    expect(api.saveBody).toHaveBeenCalledWith("n1", "지워지면 안 되는 본문");
  });

  it("타이핑 없이 포커스가 나가도 원래 본문이 그대로 저장된다", async () => {
    setupNote(mkNote("n1", "포커스만 옮겼을 뿐이다"));
    render(<NoteApp noteId="n1" />);
    await waitFor(() => expect(win.show).toHaveBeenCalled());
    fireEvent(window, new Event("blur"));
    expect(api.saveBody).toHaveBeenCalledWith("n1", "포커스만 옮겼을 뿐이다");
  });

  it("로드가 끝나기 전에는 본문을 저장하지 않는다", async () => {
    const note = mkNote("n1", "아직 읽지 못한 본문");
    setupNote(note);
    let finishLoad!: (notes: Note[]) => void;
    vi.mocked(api.listNotes).mockReturnValue(
      new Promise<Note[]>((r) => {
        finishLoad = r;
      }),
    );
    render(<NoteApp noteId="n1" />);
    // 창은 아직 노트를 모른다 — 이 시점의 플러시는 빈 값을 쓸 수밖에 없으므로
    // 저장 자체를 하지 않아야 한다.
    fireEvent(window, new Event("blur"));
    expect(api.saveBody).not.toHaveBeenCalled();
    await act(async () => {
      finishLoad([note]);
    });
    await waitFor(() => expect(win.show).toHaveBeenCalled());
  });
});
