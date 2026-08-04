import type { Note } from "./api";

export const clampFontSize = (n: number) => Math.min(40, Math.max(10, Math.round(n)));

export function filterNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => n.body.toLowerCase().includes(q));
}

export function noteTitle(note: Note): string {
  const line = note.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return "(빈 노트)";
  return line.replace(/^[#>\-*\s\d.]+/, "").replace(/[*_`~]/g, "").trim() || "(빈 노트)";
}
