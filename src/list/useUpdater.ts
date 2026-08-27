import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";

/**
 * 시작 시 조용히 새 버전을 확인하고, 설치본이면 **발견 즉시 내려받아
 * 설치·재시작한다** (#141, 전자동 — 사용자 결정 2026-08-27). 진행 중임은
 * 목록 헤더에 표시한다 — 조용한 재시작은 오동작처럼 보인다. 실패하면
 * 버튼으로 남아 클릭으로 재시도할 수 있다.
 *
 * 포터블은 설치를 돌리면 사용자가 고른 배포 형태를 바꿔 버리므로
 * 릴리스 페이지 링크만 준다. 확인 실패는 무시: 다음 시작 때 다시 본다.
 */
export function useUpdater(): { version: string; installing: boolean; run: () => void } | null {
  const [found, setFound] = useState<{
    version: string;
    downloadAndInstall: () => Promise<void>;
  } | null>(null);
  const [kind, setKind] = useState<"installed" | "portable">("installed");
  const [installing, setInstalling] = useState(false);

  const install = useCallback((u: { downloadAndInstall: () => Promise<void> }) => {
    setInstalling(true);
    u.downloadAndInstall()
      .then(() => import("@tauri-apps/plugin-process"))
      .then(({ relaunch }) => relaunch())
      .catch(() => setInstalling(false)); // 실패하면 버튼으로 남아 재시도
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const k = await api.exeKind().catch(() => "installed" as const);
      if (cancelled) return;
      setKind(k);
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = await check();
      if (cancelled || !u) return;
      setFound(u);
      if (k === "installed") install(u); // 전자동 — 발견 즉시
    };
    boot().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [install]);

  const run = useCallback(() => {
    if (!found || installing) return;
    if (kind === "portable") {
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl("https://github.com/namest504/ddakji/releases/latest"))
        .catch(() => {});
      return;
    }
    install(found);
  }, [found, installing, kind, install]);

  if (!found) return null;
  return { version: found.version, installing, run };
}
