import { invoke } from "@tauri-apps/api/core";

export type NoteColor = "yellow" | "green" | "pink" | "purple" | "blue" | "gray" | "charcoal";
// 프리셋 3종 외의 문자열은 사용자 지정 폰트명 (커스텀 폰트)
export type FontFamily = "system" | "serif" | "mono" | (string & {});
export interface WindowBounds { x: number; y: number; w: number; h: number }
export interface NoteMeta {
  id: string; created_at: string; updated_at: string;
  color: NoteColor; font_size: number; font_family: FontFamily; viewer_mode: boolean;
  window: WindowBounds; always_on_top: boolean; hidden: boolean;
}
export interface Note { meta: NoteMeta; body: string }
export type MetaPatch = Partial<Pick<NoteMeta,
  "color" | "font_size" | "font_family" | "viewer_mode" | "always_on_top" | "hidden" | "window">>;
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
export const deleteNote = (id: string) => invoke<void>("delete_note", { id });
export const openNote = (id: string) => invoke<void>("open_note", { id });
export const openList = () => invoke<void>("open_list");
export const saveImage = (id: string, ext: string, bytes: Uint8Array) =>
  invoke<string>("save_image", { id, ext, bytes: Array.from(bytes) });
export const importImage = (id: string, path: string) =>
  invoke<string>("import_image", { id, path });
export const dataRoot = () => invoke<string>("data_root");
export const getSettings = () => invoke<Settings>("get_settings");
export const openDataDir = () => invoke<void>("open_data_dir");
export const listSystemFonts = () => invoke<string[]>("list_system_fonts");
export const saveSettings = (settings: Settings) => invoke<void>("save_settings", { settings });
