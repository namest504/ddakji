import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/api", () => ({
  listTrash: vi.fn(),
  restoreNote: vi.fn(),
  purgeNote: vi.fn(),
  emptyTrash: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }));

import * as api from "../lib/api";
import type { Note, NoteMeta, TrashedNote } from "../lib/api";
import { ask } from "@tauri-apps/plugin-dialog";
import TrashView from "./TrashView";

const mkNote = (id: string, body: string): Note => ({
  meta: {
    id,
    created_at: "2026-08-10T10:00:00+09:00",
    updated_at: "2026-08-10T10:00:00+09:00",
    color: "yellow",
    font_size: 16,
    font_family: "system",
    viewer_mode: false,
    window: { x: 0, y: 0, w: 320, h: 340 },
    always_on_top: false,
    hidden: false,
    group_order: 0,
  } as NoteMeta,
  body,
});

const trashed = (id: string, body: string): TrashedNote => ({
  note: mkNote(id, body),
  deleted_at: new Date().toISOString(),
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("휴지통", () => {
  it("비어 있으면 되돌릴 수 있다는 안내를 보여 준다", async () => {
    vi.mocked(api.listTrash).mockResolvedValue([]);
    render(<TrashView onBack={() => {}} onRestored={() => {}} />);
    await screen.findByText(/휴지통이 비어 있습니다/);
    expect(screen.queryByText("비우기")).toBeNull();
  });

  it("지운 노트를 제목과 함께 보여 준다", async () => {
    vi.mocked(api.listTrash).mockResolvedValue([trashed("n1", "지워진 메모")]);
    render(<TrashView onBack={() => {}} onRestored={() => {}} />);
    await screen.findByText("지워진 메모");
    expect(screen.getByText("비우기")).toBeTruthy();
  });

  it("복원은 확인 없이 바로 되돌리고 목록을 갱신한다", async () => {
    // 복원은 되돌릴 수 있는 동작이라 확인창을 두지 않는다
    vi.mocked(api.listTrash).mockResolvedValue([trashed("n1", "지워진 메모")]);
    vi.mocked(api.restoreNote).mockResolvedValue(mkNote("n1", "지워진 메모"));
    const onRestored = vi.fn();
    render(<TrashView onBack={() => {}} onRestored={onRestored} />);
    fireEvent.click(await screen.findByText("복원"));
    await waitFor(() => expect(api.restoreNote).toHaveBeenCalledWith("n1"));
    expect(ask).not.toHaveBeenCalled();
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
  });

  it("영구 삭제는 확인을 받은 뒤에만 지운다", async () => {
    vi.mocked(api.listTrash).mockResolvedValue([trashed("n1", "지워진 메모")]);
    vi.mocked(ask).mockResolvedValue(false);
    render(<TrashView onBack={() => {}} onRestored={() => {}} />);
    fireEvent.click(await screen.findByText("영구 삭제"));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(api.purgeNote).not.toHaveBeenCalled();

    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(api.purgeNote).mockResolvedValue(undefined);
    fireEvent.click(screen.getByText("영구 삭제"));
    await waitFor(() => expect(api.purgeNote).toHaveBeenCalledWith("n1"));
  });

  it("비우기도 확인을 받는다", async () => {
    vi.mocked(api.listTrash).mockResolvedValue([trashed("n1", "a"), trashed("n2", "b")]);
    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(api.emptyTrash).mockResolvedValue(2);
    render(<TrashView onBack={() => {}} onRestored={() => {}} />);
    fireEvent.click(await screen.findByText("비우기"));
    await waitFor(() => expect(api.emptyTrash).toHaveBeenCalled());
    expect(vi.mocked(ask).mock.calls[0][0]).toContain("2개");
  });
});
