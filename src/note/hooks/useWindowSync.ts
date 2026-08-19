import { useCallback, useEffect, useRef, useState } from "react";
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

/** 되돌리기 안내가 떠 있는 시간 (ms) */
const UNDO_LINGER = 7000;

/**
 * 창 상태를 노트에 반영한다: 위치·크기 저장, 드래그 합치기 판정, 최근 본 노트 추적.
 *
 * 반환값은 "지금 놓으면 합쳐짐" 예고(암전) 여부와, 방금 다른 창을 흡수했는지다.
 *
 * 합치기는 **누적** 이동 거리로 판정한다 — 연속 이벤트 사이의 델타로 재면
 * 천천히 끄는 드래그가 임계값을 영영 넘지 못해 병합이 발동하지 않았다 (#25 G4).
 */
export function useWindowSync(noteId: string): {
  mergeHint: boolean;
  merged: boolean;
  dismissMerged: () => void;
} {
  const [mergeHint, setMergeHint] = useState(false);
  const [merged, setMerged] = useState(false);
  // 안내가 걷혀야 하는 벽시계 시각. 타이머는 창이 가려져 있는 동안 밀릴 수
  // 있으므로(WebView2 스로틀링) 기한을 따로 들고 포커스 복귀 때 재검사한다.
  const undoDeadline = useRef(0);
  const dismissMerged = useCallback(() => setMerged(false), []);

  useEffect(() => {
    const win = getCurrentWindow();
    let saveTimer: number;
    let lastPos: { x: number; y: number } | null = null;
    let dragDist = 0;
    let lastPreview = 0;
    let previewClear: number | undefined;
    let mergePending = false;

    const save = async () => {
      const factor = await win.scaleFactor();
      const pos = (await win.outerPosition()).toLogical(factor);
      const size = (await win.innerSize()).toLogical(factor);
      api
        .saveMeta(noteId, { window: { x: pos.x, y: pos.y, w: size.width, h: size.height } })
        .catch(closeIfGone);
      if (dragDist <= DRAG_THRESHOLD || mergePending) return;
      dragDist = 0;
      // 다른 노트 위에 충분히 겹치게 "드래그해서 놓였을 때"만 합친다.
      // 이 호출은 마우스 버튼이 떨어질 때까지 돌아오지 않는다(#115) — 기다리는
      // 동안 창이 더 움직여 save가 다시 돌 수 있으므로 중복 호출을 막는다.
      mergePending = true;
      api
        .checkMerge()
        .then((merged) => {
          if (!merged) setMergeHint(false);
        })
        .catch(() => {})
        .finally(() => {
          mergePending = false;
        });
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
        api
          .mergePreview()
          .then(setMergeHint)
          .catch(() => {});
      }
      window.clearTimeout(previewClear);
      // 판정이 대기 중(= 아직 놓지 않음)이면 예고를 걷지 않는다. 걷어 버리면
      // 경고가 사라진 상태로 합쳐져 "갑자기 흡수"로 느껴진다 (#115).
      previewClear = window.setTimeout(() => {
        if (!mergePending) setMergeHint(false);
      }, PREVIEW_LINGER);
      scheduleSave();
    });
    const un2 = win.onResized(scheduleSave);
    // Alt-Tab 썸네일이 보여줄 "최근 본 노트"
    const un3 = win.onFocusChanged(({ payload }) => {
      if (!payload) return;
      api.setLastViewed(noteId).catch(() => {});
      // 밀린 타이머의 몫을 여기서 대신한다 — 기한이 지났으면 즉시 걷는다
      if (undoDeadline.current && Date.now() >= undoDeadline.current) {
        undoDeadline.current = 0;
        setMerged(false);
      }
    });

    // 다른 창을 흡수하면 이 창이 "합쳤습니다 · 되돌리기"를 잠깐 띄운다 (#115)
    let undoTimer: number | undefined;
    const un4 = win.listen("merged-in", () => {
      setMerged(true);
      undoDeadline.current = Date.now() + UNDO_LINGER;
      window.clearTimeout(undoTimer);
      undoTimer = window.setTimeout(() => setMerged(false), UNDO_LINGER);
    });

    return () => {
      clearTimeout(saveTimer);
      window.clearTimeout(undoTimer);
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      un4.then((f) => f());
    };
  }, [noteId]);

  return { mergeHint, merged, dismissMerged };
}
