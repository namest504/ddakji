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

// 목록의 수정시각 표시: 방금/N분 전/N시간 전 → 하루 전/이틀 전/N일 전 → 날짜 명시
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = now.getTime() - d.getTime();
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (dayDiff <= 0) {
    if (diffMs < 60_000) return "방금";
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${mins}분 전`;
    return `${Math.floor(mins / 60)}시간 전`;
  }
  if (dayDiff === 1) return "하루 전";
  if (dayDiff === 2) return "이틀 전";
  if (dayDiff < 7) return `${dayDiff}일 전`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 상세 보기용 전체 일시: 2026.08.05 14:03
export function fullDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 썸네일 미리보기용: 마크다운 기호를 걷어낸 플레인 텍스트 (체크박스는 ☐/☑)
export function plainPreview(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[-*+]\s+\[[xX]\]\s+/gm, "$1☑ ")
    .replace(/^(\s*)[-*+]\s+\[ \]\s+/gm, "$1☐ ")
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/^\s*\n/gm, "")
    .trim();
}

export function noteTitle(note: Note): string {
  const custom = note.meta.title?.trim();
  if (custom) return custom;
  const line = note.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return "(빈 노트)";
  return line.replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)+/, "").replace(/[*_`~]/g, "").trim() || "(빈 노트)";
}
