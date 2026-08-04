import { invoke } from "@tauri-apps/api/core";

export type NoteColor = "yellow" | "green" | "pink" | "purple" | "blue" | "gray" | "charcoal";
export interface WindowBounds { x: number; y: number; w: number; h: number }
export interface NoteMeta {
  id: string; created_at: string; updated_at: string;
  color: NoteColor; font_size: number; viewer_mode: boolean;
  window: WindowBounds; always_on_top: boolean; hidden: boolean;
}
export interface Note { meta: NoteMeta; body: string }
export type MetaPatch = Partial<Pick<NoteMeta,
  "color" | "font_size" | "viewer_mode" | "always_on_top" | "hidden" | "window">>;

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
