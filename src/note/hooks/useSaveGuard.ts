import { useCallback, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 노트 파일이 밖에서 삭제됐다(`NOTE_NOT_FOUND`) — 좀비 창을 남기지 않고 닫는다.
 * 마커 문자열은 백엔드 `Error::NoteNotFound`와의 계약이다.
 */
export function closeIfGone(e: unknown): boolean {
  if (e === "NOTE_NOT_FOUND") {
    getCurrentWindow().destroy().catch(() => {});
    return true;
  }
  return false;
}

/**
 * 저장 실패를 재시도 가능한 형태로 노출한다.
 *
 * `guard(key, op)`로 감싼 작업이 실패하면 배너를 띄우고 그 작업을 기억했다가
 * `retry()`로 다시 실행한다. 같은 key의 작업이 성공하면 배너가 내려간다 —
 * 예를 들어 본문 저장이 실패한 뒤 다음 자동 저장이 성공하면 사용자가 아무것도
 * 하지 않아도 사라진다.
 */
export function useSaveGuard() {
  const [saveError, setSaveError] = useState(false);
  const failed = useRef<{ key: string; run: () => void } | null>(null);

  const guard = useCallback(<T,>(key: string, op: () => Promise<T>) => {
    const run = () => {
      op()
        .then(() => {
          if (failed.current?.key === key) {
            failed.current = null;
            setSaveError(false);
          }
        })
        .catch((e) => {
          if (closeIfGone(e)) return;
          failed.current = { key, run };
          setSaveError(true);
        });
    };
    run();
  }, []);

  const retry = useCallback(() => failed.current?.run(), []);

  return { saveError, guard, retry };
}

export type SaveGuard = ReturnType<typeof useSaveGuard>["guard"];
