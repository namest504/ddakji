import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";

/**
 * 시작 시 조용히 새 버전을 확인한다 (#141). 새 버전이 있으면 목록 헤더에
 * 버튼 하나 — 노트 창은 건드리지 않는다(메모지가 업데이트를 조르면 안 된다).
 * 확인 실패는 무시: 다음 시작 때 다시 본다.
 *
 * 업데이터는 설치본(NSIS) 전용이다. 포터블에서 설치를 돌리면 사용자가 고른
 * 배포 형태를 바꿔 버리므로, 포터블에는 릴리스 페이지 링크만 준다.
 */
export function useUpdater(): { version: string; installing: boolean; run: () => void } | null {
  const [found, setFound] = useState<{
    version: string;
    downloadAndInstall: () => Promise<void>;
  } | null>(null);
  const [kind, setKind] = useState<"installed" | "portable">("installed");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    api
      .exeKind()
      .then(setKind)
      .catch(() => {});
    import("@tauri-apps/plugin-updater")
      .then(({ check }) => check())
      .then((u) => {
        if (u) setFound(u);
      })
      .catch(() => {});
  }, []);

  const run = useCallback(() => {
    if (!found || installing) return;
    if (kind === "portable") {
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl("https://github.com/namest504/ddakji/releases/latest"))
        .catch(() => {});
      return;
    }
    setInstalling(true);
    found
      .downloadAndInstall()
      .then(() => import("@tauri-apps/plugin-process"))
      .then(({ relaunch }) => relaunch())
      .catch(() => setInstalling(false)); // 실패하면 버튼을 되살려 재시도 가능하게
  }, [found, installing, kind]);

  if (!found) return null;
  return { version: found.version, installing, run };
}
