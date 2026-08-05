// 툴바 라인 아이콘 세트 (#10). SF Symbols의 스트로크 어휘를 따른다:
// 16px 그리드, 1.6px 라운드 스트로크, currentColor. 이모지와 달리 플랫폼과
// 무관하게 동일하게 렌더링된다.
const base = {
  width: 15,
  height: 15,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const PlusIcon = () => (
  <svg {...base}><path d="M8 3v10M3 8h10" /></svg>
);

export const EyeIcon = () => (
  <svg {...base}>
    <path d="M1.8 8s2.3-3.9 6.2-3.9S14.2 8 14.2 8s-2.3 3.9-6.2 3.9S1.8 8 1.8 8z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
);

export const PencilIcon = () => (
  <svg {...base}>
    <path d="M3 13.2v-2.8l7.6-7.6 2.8 2.8-7.6 7.6H3z" />
    <path d="M9.4 4l2.8 2.8" />
  </svg>
);

export const PinIcon = ({ filled }: { filled?: boolean }) => (
  <svg {...base}>
    <circle cx="8" cy="5.2" r="3" fill={filled ? "currentColor" : "none"} />
    <path d="M8 8.2V14" />
  </svg>
);

export const ListIcon = () => (
  <svg {...base}><path d="M3 4.5h10M3 8h10M3 11.5h10" /></svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M2.8 4.6h10.4" />
    <path d="M6.1 4.4l.4-1.4h3l.4 1.4" />
    <path d="M4.1 4.6l.7 8.3a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.7-8.3" />
  </svg>
);
