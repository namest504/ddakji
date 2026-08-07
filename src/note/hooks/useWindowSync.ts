import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "../../lib/api";
import { closeIfGone } from "./useSaveGuard";

/** 창 위치·크기 저장 디바운스 (ms) */
const SAVE_DELAY = 500;
/** 드래그로 인정할 최소 누적 이동 거리 (px) */
const DRAG_THRESHOLD = 30;
/** 흡수 예고 질의 간격 (ms) */
const PREVIEW_INTERVAL = 100;
/** 이동이 멎으면 예고를 걷는 시간 (ms) */
const PREVIEW_LINGER = 600;

/**
 * 창 상태를 노트에 반영한다: 위치·크기 저장, 드래그 합치기 판정, 최근 본 노트 추적.
 *
 * 반환값은 "지금 놓으면 합쳐짐" 예고(암전) 여부다.
 *
 * 합치기는 **누적** 이동 거리로 판정한다 — 연속 이벤트 사이의 델타로 재면
 * 천천히 끄는 드래그가 임계값을 영영 넘지 못해 병합이 발동하지 않았다 (#25 G4).
 */
export function useWindowSync(noteId: string): boolean {
  const [mergeHint, setMergeHint] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let saveTimer: number;
    let lastPos: { x: number; y: number } | null = null;
    let dragDist = 0;
    let lastPreview = 0;
    let previewClear: number | undefined;

    const save = async () => {
      const factor = await win.scaleFactor();
      const pos = (await win.outerPosition()).toLogical(factor);
      const size = (await win.innerSize()).toLogical(factor);
      api
        .saveMeta(noteId, { window: { x: pos.x, y: pos.y, w: size.width, h: size.height } })
        .catch(closeIfGone);
      if (dragDist <= DRAG_THRESHOLD) return;
      dragDist = 0;
      // 다른 노트 위에 충분히 겹치게 "드래그해서" 놓였을 때만 합친다
      api.checkMerge().then((merged) => { if (!merged) setMergeHint(false); }).catch(() => {});
    };
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, SAVE_DELAY);
    };

    const un1 = win.onMoved(({ payload }) => {
      if (lastPos) {
        dragDist += Math.abs(payload.x - lastPos.x) + Math.abs(payload.y - lastPos.y);
      }
      lastPos = { x: payload.x, y: payload.y };
      const now = Date.now();
      if (now - lastPreview > PREVIEW_INTERVAL) {
        lastPreview = now;
        api.mergePreview().then(setMergeHint).catch(() => {});
      }
      window.clearTimeout(previewClear);
      previewClear = window.setTimeout(() => setMergeHint(false), PREVIEW_LINGER);
      scheduleSave();
    });
    const un2 = win.onResized(scheduleSave);
    // Alt-Tab 썸네일이 보여줄 "최근 본 노트"
    const un3 = win.onFocusChanged(({ payload }) => {
      if (payload) api.setLastViewed(noteId).catch(() => {});
    });

    return () => {
      clearTimeout(saveTimer);
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
    };
  }, [noteId]);

  return mergeHint;
}
