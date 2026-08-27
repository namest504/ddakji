import { invoke } from "@tauri-apps/api/core";

export type NoteColor = "yellow" | "green" | "pink" | "purple" | "blue" | "gray" | "charcoal";
// 프리셋 3종 외의 문자열은 사용자 지정 폰트명 (커스텀 폰트)
export type FontFamily = "system" | "serif" | "mono" | (string & {});
export interface WindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface NoteMeta {
  id: string;
  created_at: string;
  updated_at: string;
  color: NoteColor;
  font_size: number;
  font_family: FontFamily;
  viewer_mode: boolean;
  window: WindowBounds;
  always_on_top: boolean;
  hidden: boolean;
  group?: string | null;
  group_order: number;
  title?: string | null;
}
export interface Note {
  meta: NoteMeta;
  body: string;
}
export type MetaPatch = Partial<
  Pick<
    NoteMeta,
    | "color"
    | "font_size"
    | "font_family"
    | "viewer_mode"
    | "always_on_top"
    | "hidden"
    | "window"
    | "group_order"
  >
> & {
  /** 빈 문자열 = 그룹 해제 */
  group?: string;
  /** 빈 문자열 = 제목 해제(본문 파생으로 복귀) */
  title?: string;
};
export interface Settings {
  default_color: NoteColor;
  default_font_family: FontFamily;
  default_font_size: number;
  favorite_fonts: string[];
  theme: "system" | "light" | "dark";
}

export const listNotes = () => invoke<Note[]>("list_notes");
export const createNote = () => invoke<Note>("create_note");
export const saveBody = (id: string, body: string) => invoke<Note>("save_body", { id, body });
export const saveMeta = (id: string, patch: MetaPatch) => invoke<Note>("save_meta", { id, patch });
/** 삭제 = 휴지통으로 이동. 파일은 남고 목록에서만 사라진다 (#112) */
export const deleteNote = (id: string) => invoke<void>("delete_note", { id });
/** 휴지통 항목 — 노트 원본과 지운 시각 */
export interface TrashedNote {
  note: Note;
  deleted_at: string;
}
export const listTrash = () => invoke<TrashedNote[]>("list_trash");
export const restoreNote = (id: string) => invoke<Note>("restore_note", { id });
/** 영구 삭제 — 되돌릴 수 없는 유일한 지점 */
export const purgeNote = (id: string) => invoke<void>("purge_note", { id });
export const emptyTrash = () => invoke<number>("empty_trash");
export const openNote = (id: string) => invoke<void>("open_note", { id });
export const openList = () => invoke<void>("open_list");
export const saveImage = (id: string, ext: string, bytes: Uint8Array) =>
  invoke<string>("save_image", { id, ext, bytes: Array.from(bytes) });
export const importImage = (id: string, path: string) =>
  invoke<string>("import_image", { id, path });
export const importMarkdown = (path: string) => invoke<Note>("import_markdown", { path });
export const dataRoot = () => invoke<string>("data_root");
export const getSettings = () => invoke<Settings>("get_settings");
export const openDataDir = () => invoke<void>("open_data_dir");
// 노트 파일을 선택한 채 탐색기 열기 (#98)
export const revealNote = (id: string) => invoke<void>("reveal_note", { id });
export const listSystemFonts = () => invoke<string[]>("list_system_fonts");
export const setLastViewed = (id: string) => invoke<void>("set_last_viewed", { id });
export const setStoragePath = (newPath: string) => invoke<void>("set_storage_path", { newPath });
export const navGroup = (dir: 1 | -1) => invoke<Note | null>("nav_group", { dir });
/** 모음집 이름 바꾸기 — 충돌·빈 이름이면 reject (#139) */
export const renameGroup = (old: string, next: string) =>
  invoke<number>("rename_group", { old, new: next });
export const navTo = (id: string) => invoke<Note | null>("nav_to", { id });
export const groupMembers = (id: string) => invoke<string[]>("group_members", { id });
/** 이 창의 현재 노트 하나만 숨긴다. 모음집이면 창이 전환할 다음 멤버를 돌려준다 */
export const hideNote = () => invoke<Note | null>("hide_note");
/** 이 창이 든 모음집을 통째로 숨긴다 (창을 닫는 일은 호출자가) */
export const hideGroup = () => invoke<void>("hide_group");
/** 드롭을 기다렸다가 판정한다 — 버튼을 놓을 때까지 돌아오지 않는다 (#115) */
export const checkMerge = () => invoke<boolean>("check_merge");
/** 직전 합치기 되돌리기 — 이전 모음집과 창 자리를 복구한다 */
export const undoMerge = () => invoke<boolean>("undo_merge");
export const mergePreview = () => invoke<boolean>("merge_preview");
// 현재 노트가 새 창으로 분리되고, 이 창이 표시할 다음 멤버가 반환된다 (#74)
export const popOut = () => invoke<Note | null>("pop_out");
export const listGroups = () => invoke<string[]>("list_groups");
export const getLastViewed = () => invoke<Note | null>("get_last_viewed");
export const saveSettings = (settings: Settings) => invoke<void>("save_settings", { settings });
