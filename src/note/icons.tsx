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

export const PinIcon = ({ filled }: { filled?: boolean }) => (
  <svg {...base}>
    <circle cx="8" cy="5.2" r="3" fill={filled ? "currentColor" : "none"} />
    <path d="M8 8.2V14" />
  </svg>
);

export const ListIcon = () => (
  <svg {...base}><path d="M3 4.5h10M3 8h10M3 11.5h10" /></svg>
);

export const CheckboxIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
    <path d="M5.2 8.2l2 2 3.6-4" />
  </svg>
);

export const IndentIcon = () => (
  <svg {...base}><path d="M7 4h7M7 8h7M7 12h7M2 5.6L4.6 8 2 10.4" /></svg>
);

export const OutdentIcon = () => (
  <svg {...base}><path d="M7 4h7M7 8h7M7 12h7M4.6 5.6L2 8l2.6 2.4" /></svg>
);

export const ImageIcon = () => (
  <svg {...base}>
    <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.5" />
    <circle cx="5.6" cy="6.4" r="1.1" />
    <path d="M2.6 11.2l3.2-3 2.4 2.2 3-3 2.6 2.6" />
  </svg>
);

export const GearIcon = () => (
  // 외곽 링 + 톱니 + 허브 — 링이 없으면 태양(밝기 토글)으로 읽힌다
  <svg {...base}>
    <circle cx="8" cy="8" r="4.2" />
    <circle cx="8" cy="8" r="1.5" />
    <path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M12.4 3.6l-1.3 1.3M3.6 3.6l1.3 1.3M12.4 12.4l-1.3-1.3M3.6 12.4l1.3-1.3" />
  </svg>
);

export const BackIcon = () => (
  <svg {...base}><path d="M10 3.2L5.2 8 10 12.8" /></svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M2.8 4.6h10.4" />
    <path d="M6.1 4.4l.4-1.4h3l.4 1.4" />
    <path d="M4.1 4.6l.7 8.3a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.7-8.3" />
  </svg>
);
