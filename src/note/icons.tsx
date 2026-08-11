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
  <svg {...base}>
    <path d="M8 3v10M3 8h10" />
  </svg>
);

export const PinIcon = ({ filled }: { filled?: boolean }) => (
  <svg {...base}>
    <circle cx="8" cy="5.2" r="3" fill={filled ? "currentColor" : "none"} />
    <path d="M8 8.2V14" />
  </svg>
);

export const ListIcon = () => (
  <svg {...base}>
    <path d="M3 4.5h10M3 8h10M3 11.5h10" />
  </svg>
);

export const NavLeftIcon = () => (
  <svg {...base} width="18" height="18">
    <path d="M10 3.4L5.4 8 10 12.6" />
  </svg>
);

export const NavRightIcon = () => (
  <svg {...base} width="18" height="18">
    <path d="M6 3.4L10.6 8 6 12.6" />
  </svg>
);

export const PopOutIcon = () => (
  <svg {...base}>
    <path d="M6.5 3H4a1.4 1.4 0 0 0-1.4 1.4v7.2A1.4 1.4 0 0 0 4 13h7.2a1.4 1.4 0 0 0 1.4-1.4V9.5" />
    <path d="M9.4 2.8h3.8v3.8M13 3L8.2 7.8" />
  </svg>
);

// 이 장만 숨기기 — 한 장을 아래로 내려 치우는 모양 (닫기 X와 구분된다)
export const HideIcon = () => (
  <svg {...base}>
    <path d="M8 2.6v6.4M5.3 6.4L8 9.1l2.7-2.7" />
    <path d="M3.2 12.6h9.6" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
  </svg>
);

export const InfoIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.7" />
    <path d="M8 7.6v3.2" />
    <circle cx="8" cy="5.1" r="0.4" fill="currentColor" />
  </svg>
);

export const ImportIcon = () => (
  // 트레이로 내려오는 화살표 — 마크다운 파일 가져오기
  <svg {...base}>
    <path d="M8 2.5V9" />
    <path d="M5.5 6.7L8 9.2l2.5-2.5" />
    <path d="M2.5 10.2v1.9A1.4 1.4 0 0 0 3.9 13.5h8.2a1.4 1.4 0 0 0 1.4-1.4v-1.9" />
  </svg>
);

export const GroupIcon = () => (
  // 겹친 카드 두 장 — 모음집
  <svg {...base}>
    <rect x="2.5" y="5.2" width="9.6" height="8.2" rx="1.6" />
    <path d="M5.2 5.2V4a1.4 1.4 0 0 1 1.4-1.4h5.5A1.4 1.4 0 0 1 13.5 4v6.2" />
  </svg>
);

export const EraserIcon = () => (
  <svg {...base}>
    <path d="M8.7 3.6l3.7 3.7-5.4 5.4H4.6l-2.1-2.1a1.2 1.2 0 0 1 0-1.7l6.2-5.3z" />
    <path d="M5.9 6.6l3.6 3.6M8.6 12.7h5" />
  </svg>
);

export const CheckboxIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
    <path d="M5.2 8.2l2 2 3.6-4" />
  </svg>
);

export const IndentIcon = () => (
  <svg {...base}>
    <path d="M7 4h7M7 8h7M7 12h7M2 5.6L4.6 8 2 10.4" />
  </svg>
);

export const OutdentIcon = () => (
  <svg {...base}>
    <path d="M7 4h7M7 8h7M7 12h7M4.6 5.6L2 8l2.6 2.4" />
  </svg>
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
  <svg {...base}>
    <path d="M10 3.2L5.2 8 10 12.8" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M2.8 4.6h10.4" />
    <path d="M6.1 4.4l.4-1.4h3l.4 1.4" />
    <path d="M4.1 4.6l.7 8.3a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.7-8.3" />
  </svg>
);
