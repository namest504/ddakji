import { createContext, useContext, useEffect, useState } from "react";
import * as api from "./api";

/**
 * 앱 문자열 사전 (#143). 라이브러리 없이 타입으로 강제한다 —
 * `en`이 `Record<MsgKey, string>`이므로 **키가 한쪽에만 있으면 컴파일 에러**.
 * 값의 `{x}`는 `t(key, { x })`로 채운다. CLI·MCP는 여기 없다(항상 영어).
 */
export const ko = {
  // 노트 툴바
  newNote: "새 노트 (Ctrl+N)",
  color: "색상",
  font: "폰트",
  popOut: "모음집에서 꺼내기 (Ctrl+Shift+P)",
  fontSmaller: "글씨 작게",
  fontBigger: "글씨 크게",
  openList: "노트 목록 (Ctrl+L)",
  alwaysOnTop: "항상 위",
  hideNote: "이 장만 숨기기 (Ctrl+W) — 창은 다음 장으로",
  hideSolo: "숨기기 (Ctrl+W) — 목록에서 다시 열 수 있다",
  hideWindow: "이 창 숨기기 (Ctrl+Shift+W) — 모음집 전체",
  fontSystem: "시스템",
  fontSerif: "세리프",
  fontMono: "고정폭",
  fontSearch: "폰트 검색…",
  // 노트 본문·뒷면
  prevNote: "이전 노트 (Alt+←)",
  nextNote: "다음 노트 (Alt+→)",
  flipToBack: "뒷면 정보",
  flipToBackAria: "뒤집어서 정보 보기",
  flipToFront: "앞면으로",
  flipToFrontAria: "앞면으로 돌아가기",
  backTitle: "뒷면",
  createdAt: "만든 날",
  group: "모음집",
  file: "파일",
  none: "없음",
  revealFile: "파일 위치 열기",
  delete: "삭제",
  share: "공유",
  copyFormatted: "서식 복사",
  copied: "복사됨",
  exportMd: "마크다운",
  exportHtml: "HTML",
  exportedWith: "ddakji로 작성됨",
  deleteNoteTitle: "노트 삭제",
  deleteToTrash: "이 노트를 휴지통으로 보낼까요? 휴지통에서 되돌릴 수 있습니다.",
  cancel: "취소",
  saveFailed: "저장 실패 — ",
  retry: "재시도",
  mergedIntoGroup: "모음집으로 합쳤습니다",
  undo: "되돌리기",
  dismissNotice: "안내 닫기",
  // 서식 바
  bold: "굵게 (Ctrl+B)",
  italic: "기울임 (Ctrl+I)",
  underline: "밑줄 (Ctrl+U)",
  strike: "취소선 (Ctrl+Shift+S)",
  bulletList: "글머리 목록",
  checkbox: "체크박스",
  indent: "들여쓰기 (Tab)",
  outdent: "내어쓰기 (Shift+Tab)",
  insertImage: "이미지 삽입",
  resizeGrip: "끌어서 크기 조절 · 두 번 누르면 원래 크기",
  clearFormat: "서식 지우기 (본문으로)",
  imageFilter: "이미지",
  // 목록
  search: "검색",
  newNoteShort: "새 노트",
  importMd: "마크다운 가져오기",
  selectToGroup: "선택해서 모음집으로 묶기",
  trash: "휴지통",
  settings: "설정",
  goBack: "뒤로",
  emptyList: "노트가 없습니다. ＋로 시작하세요.",
  selectPrompt: "묶을 노트를 선택하세요",
  groupNamePlaceholder: "모음집 이름 (Enter)",
  ungroup: "해제",
  looseNotes: "노트",
  renameGroup: "이름 바꾸기",
  groupExists: "같은 이름의 모음집이 있습니다",
  detailView: "자세히 보기",
  close: "닫기",
  title: "제목",
  createdDate: "만든 날짜",
  updatedDate: "수정한 날짜",
  restore: "복원",
  trashEmpty: "휴지통이 비어 있습니다.",
  openNote: "노트 열기",
  viewUsage: "사용법 보기",
  // 휴지통
  trashHint: "지운 노트는 여기 남고, 언제든 되돌릴 수 있습니다.",
  restoreNote: "이 노트를 목록으로 되돌린다",
  purge: "영구 삭제",
  purgeTitle: "파일까지 지운다 — 되돌릴 수 없다",
  purgeConfirm: "이 노트를 완전히 지울까요? 되돌릴 수 없습니다.",
  emptyTrash: "비우기",
  emptyTrashConfirm: "휴지통의 노트 {n}개를 완전히 지울까요? 되돌릴 수 없습니다.",
  // 설정
  newNoteDefaults: "새 노트 기본값",
  fontSize: "글씨 크기",
  favoriteFonts: "자주 쓰는 폰트",
  addFont: "＋ 폰트 추가 (설치된 폰트 조회)",
  fontListFailed: "폰트 목록을 가져오지 못했습니다",
  remove: "제거",
  theme: "테마",
  themeSystem: "시스템",
  themeLight: "라이트",
  themeDark: "다크",
  language: "언어",
  langSystem: "시스템",
  storage: "저장 위치",
  changeStorage: "저장 위치 변경",
  changeStorageEllipsis: "저장 위치 변경…",
  openDataFolder: "데이터 폴더 열기",
  pickStorageFolder: "새 저장 폴더 선택",
  moveDataConfirm: "데이터를 다음 위치로 이동하고 앱을 다시 시작합니다:\n{dir}",
  move: "이동",
  autostart: "부팅 시 시작",
  info: "정보",
  version: "버전",
  loading: "불러오는 중…",
  // 업데이트
  updateTo: "v{v} 업데이트",
  installingUpdate: "설치 중…",
  // 상대 시각
  justNow: "방금",
  minutesAgo: "{n}분 전",
  hoursAgo: "{n}시간 전",
  dayAgo: "하루 전",
  twoDaysAgo: "이틀 전",
  daysAgo: "{n}일 전",
} as const;

export type MsgKey = keyof typeof ko;

export const en: Record<MsgKey, string> = {
  newNote: "New note (Ctrl+N)",
  color: "Color",
  font: "Font",
  popOut: "Pop out of collection (Ctrl+Shift+P)",
  fontSmaller: "Smaller text",
  fontBigger: "Larger text",
  openList: "Note list (Ctrl+L)",
  alwaysOnTop: "Always on top",
  hideNote: "Hide this page (Ctrl+W) — window shows the next one",
  hideSolo: "Hide (Ctrl+W) — reopen from the list",
  hideWindow: "Hide this window (Ctrl+Shift+W) — whole collection",
  fontSystem: "System",
  fontSerif: "Serif",
  fontMono: "Monospace",
  fontSearch: "Search fonts…",
  prevNote: "Previous note (Alt+←)",
  nextNote: "Next note (Alt+→)",
  flipToBack: "Back side",
  flipToBackAria: "Flip to details",
  flipToFront: "To front",
  flipToFrontAria: "Back to the front side",
  backTitle: "Back",
  createdAt: "Created",
  group: "Collection",
  file: "File",
  none: "None",
  revealFile: "Open file location",
  delete: "Delete",
  share: "Share",
  copyFormatted: "Copy formatted",
  copied: "Copied",
  exportMd: "Markdown",
  exportHtml: "HTML",
  exportedWith: "Written with ddakji",
  deleteNoteTitle: "Delete note",
  deleteToTrash: "Move this note to the trash? You can restore it later.",
  cancel: "Cancel",
  saveFailed: "Save failed — ",
  retry: "Retry",
  mergedIntoGroup: "Merged into a collection",
  undo: "Undo",
  dismissNotice: "Dismiss",
  bold: "Bold (Ctrl+B)",
  italic: "Italic (Ctrl+I)",
  underline: "Underline (Ctrl+U)",
  strike: "Strikethrough (Ctrl+Shift+S)",
  bulletList: "Bullet list",
  checkbox: "Checkbox",
  indent: "Indent (Tab)",
  outdent: "Outdent (Shift+Tab)",
  insertImage: "Insert image",
  resizeGrip: "Drag to resize · double-press for original size",
  clearFormat: "Clear formatting",
  imageFilter: "Images",
  search: "Search",
  newNoteShort: "New note",
  importMd: "Import Markdown",
  selectToGroup: "Select notes to group",
  trash: "Trash",
  settings: "Settings",
  goBack: "Back",
  emptyList: "No notes yet. Start with ＋.",
  selectPrompt: "Select notes to group",
  groupNamePlaceholder: "Collection name (Enter)",
  ungroup: "Ungroup",
  looseNotes: "Notes",
  renameGroup: "Rename",
  groupExists: "A collection with that name already exists",
  detailView: "Details",
  close: "Close",
  title: "Title",
  createdDate: "Created",
  updatedDate: "Modified",
  restore: "Restore",
  trashEmpty: "The trash is empty.",
  openNote: "Open note",
  viewUsage: "How to use",
  trashHint: "Deleted notes stay here — restore them anytime.",
  restoreNote: "Restore this note to the list",
  purge: "Delete forever",
  purgeTitle: "Deletes the file too — cannot be undone",
  purgeConfirm: "Delete this note permanently? This cannot be undone.",
  emptyTrash: "Empty",
  emptyTrashConfirm: "Permanently delete {n} note(s) in the trash? This cannot be undone.",
  newNoteDefaults: "New note defaults",
  fontSize: "Text size",
  favoriteFonts: "Favorite fonts",
  addFont: "＋ Add font (from installed fonts)",
  fontListFailed: "Couldn't load the font list",
  remove: "Remove",
  theme: "Theme",
  themeSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  language: "Language",
  langSystem: "System",
  storage: "Storage location",
  changeStorage: "Change storage location",
  changeStorageEllipsis: "Change storage location…",
  openDataFolder: "Open data folder",
  pickStorageFolder: "Choose a new storage folder",
  moveDataConfirm: "Move your data to the following location and restart the app:\n{dir}",
  move: "Move",
  autostart: "Start at login",
  info: "About",
  version: "Version",
  loading: "Loading…",
  updateTo: "Update to v{v}",
  installingUpdate: "Installing…",
  justNow: "just now",
  minutesAgo: "{n}m ago",
  hoursAgo: "{n}h ago",
  dayAgo: "yesterday",
  twoDaysAgo: "2 days ago",
  daysAgo: "{n} days ago",
};

export type Lang = "ko" | "en";
export type LangSetting = "system" | Lang;

/** 판정 규칙은 백엔드(i18n.rs)와 같아야 한다: ko*면 ko, 그 외 en */
export function resolveLang(
  setting: string,
  navLang: string = typeof navigator !== "undefined" ? navigator.language : "en",
): Lang {
  if (setting === "ko" || setting === "en") return setting;
  return navLang.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function translate(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string {
  let out: string = (lang === "ko" ? ko : en)[key];
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

const LangContext = createContext<Lang>("ko");

// React 밖(에디터 확장의 DOM 조작 등)에서 쓰는 현재 언어. Provider가 갱신한다.
// 훅을 못 쓰는 자리 전용 — 컴포넌트에서는 useT/useLang을 쓸 것.
let current: Lang = "ko";
export function currentLang(): Lang {
  return current;
}

/** 설정을 읽어 언어를 정하고, settings-changed에 따라 산다 (#143) */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => resolveLang("system"));
  useEffect(() => {
    const apply = () =>
      api
        .getSettings()
        .then((s) => setLang(resolveLang(s.language)))
        .catch(() => {});
    apply();
    let un: (() => void) | null = null;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("settings-changed", apply))
      .then((f) => {
        un = f;
      })
      .catch(() => {});
    return () => {
      if (un) un();
    };
  }, []);
  useEffect(() => {
    current = lang; // 훅 밖 소비자(에디터 확장)용 스냅숏
  }, [lang]);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** `const t = useT();` → `t("delete")` / `t("minutesAgo", { n: 5 })` */
export function useT() {
  const lang = useContext(LangContext);
  return (key: MsgKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
