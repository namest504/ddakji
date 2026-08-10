import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const destroy = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy }) }));

import { useSaveGuard } from "./useSaveGuard";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("useSaveGuard", () => {
  it("성공한 작업은 배너를 띄우지 않는다", async () => {
    const { result } = renderHook(() => useSaveGuard());
    act(() => result.current.guard("body", () => Promise.resolve("ok")));
    await waitFor(() => expect(result.current.saveError).toBe(false));
  });

  it("실패하면 배너를 띄우고, 재시도로 같은 작업을 다시 실행한다", async () => {
    const op = vi.fn().mockRejectedValueOnce("disk full").mockResolvedValueOnce("ok");
    const { result } = renderHook(() => useSaveGuard());
    act(() => result.current.guard("body", op));
    await waitFor(() => expect(result.current.saveError).toBe(true));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.saveError).toBe(false));
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("같은 key의 다음 작업이 성공하면 배너가 저절로 내려간다", async () => {
    // 자동 저장은 주기적으로 재시도되므로 사용자가 아무것도 하지 않아도 회복된다
    const { result } = renderHook(() => useSaveGuard());
    act(() => result.current.guard("body", () => Promise.reject("일시적 실패")));
    await waitFor(() => expect(result.current.saveError).toBe(true));

    act(() => result.current.guard("body", () => Promise.resolve("ok")));
    await waitFor(() => expect(result.current.saveError).toBe(false));
  });

  it("다른 key의 성공은 남아 있는 실패 배너를 지우지 않는다", async () => {
    const { result } = renderHook(() => useSaveGuard());
    act(() => result.current.guard("body", () => Promise.reject("실패")));
    await waitFor(() => expect(result.current.saveError).toBe(true));

    act(() => result.current.guard("meta", () => Promise.resolve("ok")));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.saveError).toBe(true);
  });

  it("NOTE_NOT_FOUND는 배너 대신 창을 닫는다", async () => {
    // 밖에서 삭제된 노트의 좀비 창을 남기지 않기 위한 계약 (백엔드 Error::NoteNotFound)
    const { result } = renderHook(() => useSaveGuard());
    act(() => result.current.guard("body", () => Promise.reject("NOTE_NOT_FOUND")));
    await waitFor(() => expect(destroy).toHaveBeenCalled());
    expect(result.current.saveError).toBe(false);
  });
});
