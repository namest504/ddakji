import type { FontFamily, Note } from "./api";

// 의미 키 → 플랫폼 폰트 스택. mac/iOS 이식 시 여기만 플랫폼별로 확장한다.
const FONT_STACKS: Record<string, string> = {
  system: '"Segoe UI", "Malgun Gothic", sans-serif',
  serif: 'Georgia, "Batang", serif',
  mono: 'Consolas, "Malgun Gothic", monospace',
};

export const FONT_PRESETS = ["system", "serif", "mono"] as const;

// 프리셋이 아닌 값은 사용자가 설치한 폰트명으로 취급한다 (예: "JetBrains Mono")
export const fontStack = (f: FontFamily): string =>
  FONT_STACKS[f] ?? `"${f}", "Malgun Gothic", sans-serif`;

export const clampFontSize = (n: number) => Math.min(40, Math.max(10, Math.round(n)));

// 스크롤 여지가 남았는지 (하단 "더 있음" 표시용). 임계값 8px 이내는 바닥으로 본다.
export const hasMoreBelow = (scrollHeight: number, scrollTop: number, clientHeight: number) =>
  scrollHeight - scrollTop - clientHeight > 8;

export function filterNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => n.body.toLowerCase().includes(q));
}

// 목록의 수정시각 표시: 오늘 → "오후 2:10", 어제 → "어제", 그 외 → "M/D"
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) {
    return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return "어제";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function noteTitle(note: Note): string {
  const line = note.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return "(빈 노트)";
  return line.replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)+/, "").replace(/[*_`~]/g, "").trim() || "(빈 노트)";
}
