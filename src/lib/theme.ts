import * as api from "./api";

export type ThemePref = "system" | "light" | "dark";

// 설정값과 OS 다크 모드 여부로 실제 표시 테마를 결정한다
export const resolveTheme = (pref: ThemePref, prefersDark: boolean): "light" | "dark" =>
  pref === "system" ? (prefersDark ? "dark" : "light") : pref;

// 창 시작 시 1회 호출: 테마를 <html data-theme>에 반영하고,
// OS 테마 변경과 설정 변경(settings-changed 이벤트)을 구독한다.
export async function initTheme(): Promise<void> {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let pref: ThemePref = "system";
  const apply = () => {
    document.documentElement.dataset.theme = resolveTheme(pref, mq.matches);
  };
  const refresh = async () => {
    try {
      pref = (await api.getSettings()).theme;
    } catch {
      pref = "system";
    }
    apply();
  };
  mq.addEventListener("change", apply);
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen("settings-changed", refresh);
  } catch {
    // 테스트 등 Tauri 밖 환경에서는 이벤트 구독 생략
  }
  await refresh();
}
