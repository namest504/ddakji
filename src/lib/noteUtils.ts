import type { FontFamily, Note } from "./api";

// 의미 키 → 플랫폼 폰트 스택. mac/iOS 이식 시 여기만 플랫폼별로 확장한다.
const FONT_STACKS: Record<FontFamily, string> = {
  system: '"Segoe UI", "Malgun Gothic", sans-serif',
  serif: 'Georgia, "Batang", serif',
  mono: 'Consolas, "Malgun Gothic", monospace',
};

export const fontStack = (f: FontFamily): string => FONT_STACKS[f] ?? FONT_STACKS.system;

export const clampFontSize = (n: number) => Math.min(40, Math.max(10, Math.round(n)));

// 노트를 열 때의 표시 모드. 스티키 노트의 평상시 모습은 렌더된 뷰이므로 본문이
// 있으면 저장된 모드와 무관하게 뷰어로 열고, 빈 노트만 편집 모드로 연다 (#9).
export const initialViewerMode = (body: string) => body.trim().length > 0;

// 스크롤 여지가 남았는지 (하단 "더 있음" 표시용). 임계값 8px 이내는 바닥으로 본다.
export const hasMoreBelow = (scrollHeight: number, scrollTop: number, clientHeight: number) =>
  scrollHeight - scrollTop - clientHeight > 8;

export function filterNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => n.body.toLowerCase().includes(q));
}

export function noteTitle(note: Note): string {
  const line = note.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return "(빈 노트)";
  return line.replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)+/, "").replace(/[*_`~]/g, "").trim() || "(빈 노트)";
}
