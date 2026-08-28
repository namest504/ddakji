//! 자동 정렬 (#170) — 노트 창을 크기 그대로, 모니터 작업 영역 안에 겹침 없이 재배치.
//!
//! 배치는 선반(shelf) 방식 "촘촘 정렬": 높이 내림차순으로 왼쪽 위부터 줄 단위로
//! 채운다. 노트는 자기가 떠 있던 모니터 안에서만 움직인다(모니터 간 이동 없음).

use tauri::{AppHandle, Manager};

/// 작업 영역 가장자리 여백 (논리 px)
const MARGIN: f64 = 24.0;
/// 노트 사이 간격 (논리 px)
const GAP: f64 = 16.0;
/// 공간 부족 시 계단식 쌓기의 창별 어긋남 (논리 px). 세로 어긋남은 타이틀바
/// 높이(40)보다 커야 밑에 깔린 창도 집을 수 있다.
const CASCADE_X: f64 = 56.0;
const CASCADE_Y: f64 = 52.0;
/// 이동 애니메이션 — 합치기 흡수(check_merge)와 같은 리듬
const ANIM_STEPS: u32 = 8;
const ANIM_TICK_MS: u64 = 14;

/// (w, h)들을 작업 영역 `work`(x, y, w, h) 안에 선반 방식으로 배치한 (x, y)들.
///
/// 입력 순서 = 배치 순서(호출자가 정렬해 넘긴다). 좌표 단위는 자유지만 여백·간격
/// 상수는 논리 px이므로 물리 px로 부를 때는 `scale`로 환산한다(테스트는 1.0).
///
/// 다 들어가지 못한 창은 오른쪽 위에 계단식으로 겹쳐 쌓는다 — 크기를 줄이지
/// 않는 한 겹침은 불가피하고, 타이틀바만 드러나면 집어서 수습할 수 있다.
pub fn arrange_rects(
    sizes: &[(f64, f64)],
    work: (f64, f64, f64, f64),
    scale: f64,
) -> Vec<(f64, f64)> {
    let (margin, gap) = (MARGIN * scale, GAP * scale);
    let (wx, wy, ww, wh) = work;
    let (left, top) = (wx + margin, wy + margin);
    let (right, bottom) = (wx + ww - margin, wy + wh - margin);

    let mut out = vec![(0.0, 0.0); sizes.len()];
    let (mut cx, mut cy, mut row_h) = (left, top, 0.0f64);
    let mut overflow = Vec::new();
    for (i, &(w, h)) in sizes.iter().enumerate() {
        if cx > left && cx + w > right {
            cx = left;
            cy += row_h + gap;
            row_h = 0.0;
        }
        if cy + h > bottom {
            overflow.push(i);
            continue;
        }
        out[i] = (cx, cy);
        cx += w + gap;
        row_h = row_h.max(h);
    }
    for (k, &i) in overflow.iter().enumerate() {
        let (w, h) = sizes[i];
        let x = (right - w - k as f64 * CASCADE_X * scale).max(left);
        let y = (top + k as f64 * CASCADE_Y * scale).min((bottom - h).max(top));
        out[i] = (x, y);
    }
    out
}

/// 화면에 떠 있는 노트 창 전부를 자기 모니터의 작업 영역 안에 촘촘 정렬한다.
///
/// 새 위치 저장은 하지 않는다 — `set_position`이 `onMoved`를 울리고 프런트의
/// 위치 저장 디바운스가 받아 적는다(드래그 이동과 같은 경로).
pub fn run(app: &AppHandle) {
    let Some(wn) = app.try_state::<crate::commands::WindowNotes>() else {
        return;
    };
    let labels: Vec<String> = match wn.0.lock() {
        Ok(m) => m.keys().cloned().collect(),
        Err(_) => return,
    };
    struct Win {
        win: tauri::WebviewWindow,
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    }
    let mut wins = Vec::new();
    for l in labels {
        let Some(w) = app.get_webview_window(&l) else {
            continue;
        };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) else {
            continue;
        };
        wins.push(Win {
            win: w,
            x: p.x as f64,
            y: p.y as f64,
            w: s.width as f64,
            h: s.height as f64,
        });
    }
    if wins.is_empty() {
        return;
    }
    let monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return;
    }
    // 창 중심이 든 모니터별로 묶는다. 어느 모니터에도 없으면(경계 밖 잔여 등)
    // 중심이 가장 가까운 모니터로 귀속시킨다.
    let mut groups: Vec<Vec<usize>> = vec![Vec::new(); monitors.len()];
    for (i, wr) in wins.iter().enumerate() {
        let (cx, cy) = (wr.x + wr.w / 2.0, wr.y + wr.h / 2.0);
        let mi = monitors
            .iter()
            .position(|m| {
                let (p, s) = (m.position(), m.size());
                cx >= p.x as f64
                    && cx < p.x as f64 + s.width as f64
                    && cy >= p.y as f64
                    && cy < p.y as f64 + s.height as f64
            })
            .unwrap_or_else(|| {
                let dist = |m: &tauri::Monitor| {
                    let (p, s) = (m.position(), m.size());
                    let mx = p.x as f64 + s.width as f64 / 2.0;
                    let my = p.y as f64 + s.height as f64 / 2.0;
                    (mx - cx).powi(2) + (my - cy).powi(2)
                };
                let mut best = 0;
                for (j, m) in monitors.iter().enumerate() {
                    if dist(m) < dist(&monitors[best]) {
                        best = j;
                    }
                }
                best
            });
        groups[mi].push(i);
    }
    // 모니터별 목표 위치 (물리 px)
    let mut targets: Vec<(usize, f64, f64)> = Vec::new();
    for (mi, idxs) in groups.iter().enumerate() {
        if idxs.is_empty() {
            continue;
        }
        let m = &monitors[mi];
        let wa = m.work_area();
        let work = (
            wa.position.x as f64,
            wa.position.y as f64,
            wa.size.width as f64,
            wa.size.height as f64,
        );
        // 촘촘 정렬: 높이 내림차순(동률이면 너비 내림차순)이 줄 낭비가 가장 적다
        let mut order = idxs.clone();
        order.sort_by(|&a, &b| {
            (wins[b].h, wins[b].w)
                .partial_cmp(&(wins[a].h, wins[a].w))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let sizes: Vec<(f64, f64)> = order.iter().map(|&i| (wins[i].w, wins[i].h)).collect();
        let pos = arrange_rects(&sizes, work, m.scale_factor());
        for (k, &i) in order.iter().enumerate() {
            targets.push((i, pos[k].0, pos[k].1));
        }
    }
    // 전 창 동시 슬라이드 — 흡수 애니메이션과 같은 smoothstep
    for step in 1..=ANIM_STEPS {
        let t = step as f64 / ANIM_STEPS as f64;
        let e = t * t * (3.0 - 2.0 * t);
        for &(i, tx, ty) in &targets {
            let w = &wins[i];
            let x = w.x + (tx - w.x) * e;
            let y = w.y + (ty - w.y) * e;
            let _ = w
                .win
                .set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
        }
        std::thread::sleep(std::time::Duration::from_millis(ANIM_TICK_MS));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: (f64, f64, f64, f64) = (0.0, 0.0, 1920.0, 1032.0);

    fn overlaps(a: (f64, f64, f64, f64), b: (f64, f64, f64, f64)) -> bool {
        a.0 < b.0 + b.2 && b.0 < a.0 + a.2 && a.1 < b.1 + b.3 && b.1 < a.1 + a.3
    }

    #[test]
    fn packs_left_to_right_top_to_bottom() {
        let sizes = [(400.0, 300.0), (400.0, 300.0), (400.0, 200.0)];
        let pos = arrange_rects(&sizes, WORK, 1.0);
        assert_eq!(pos[0], (24.0, 24.0));
        assert_eq!(pos[1], (440.0, 24.0)); // 24 + 400 + 16
        assert_eq!(pos[2], (856.0, 24.0));
    }

    #[test]
    fn wraps_to_next_row_when_row_is_full() {
        let sizes = [(900.0, 300.0), (900.0, 300.0), (900.0, 200.0)];
        let pos = arrange_rects(&sizes, WORK, 1.0);
        assert_eq!(pos[0].1, 24.0);
        assert_eq!(pos[1].1, 24.0);
        // 세 번째는 줄이 차서 다음 줄: 24 + 300 + 16
        assert_eq!(pos[2], (24.0, 340.0));
    }

    #[test]
    fn placed_windows_never_overlap() {
        let sizes: Vec<(f64, f64)> = (0..8).map(|i| (300.0 + i as f64 * 40.0, 250.0)).collect();
        let pos = arrange_rects(&sizes, WORK, 1.0);
        for i in 0..sizes.len() {
            for j in (i + 1)..sizes.len() {
                let a = (pos[i].0, pos[i].1, sizes[i].0, sizes[i].1);
                let b = (pos[j].0, pos[j].1, sizes[j].0, sizes[j].1);
                assert!(!overlaps(a, b), "{i}와 {j}가 겹침: {a:?} vs {b:?}");
            }
        }
    }

    #[test]
    fn everything_stays_inside_the_work_area() {
        let sizes: Vec<(f64, f64)> = (0..6).map(|_| (500.0, 400.0)).collect();
        let pos = arrange_rects(&sizes, WORK, 1.0);
        for (i, &(x, y)) in pos.iter().enumerate() {
            assert!(x >= 24.0 && y >= 24.0, "{i}가 여백 침범: ({x}, {y})");
            assert!(x + sizes[i].0 <= 1920.0 - 24.0, "{i}가 오른쪽 초과");
        }
    }

    #[test]
    fn overflow_cascades_top_right_with_title_bars_reachable() {
        // 작업 영역보다 훨씬 많은 창 — 뒤쪽은 계단식으로 쌓인다
        let sizes: Vec<(f64, f64)> = (0..12).map(|_| (800.0, 500.0)).collect();
        let pos = arrange_rects(&sizes, WORK, 1.0);
        // 정상 배치는 2×1 줄 = 4개(줄당 2개, 2줄), 나머지 8개가 계단식
        let overflowed: Vec<usize> = (4..12).collect();
        for w in overflowed.windows(2) {
            let (a, b) = (pos[w[0]], pos[w[1]]);
            // 다음 창이 왼쪽 아래로 어긋나며, 세로 어긋남이 타이틀바(40)보다 크다
            assert!(
                b.1 - a.1 >= 40.0 || b.0 < a.0,
                "계단 어긋남 부족: {a:?} → {b:?}"
            );
        }
        // 계단도 작업 영역 안
        for &i in &overflowed {
            assert!(pos[i].0 >= 24.0 && pos[i].1 >= 24.0);
        }
    }

    #[test]
    fn scale_multiplies_margins_only() {
        let sizes = [(400.0, 300.0)];
        let pos = arrange_rects(&sizes, WORK, 2.0);
        assert_eq!(pos[0], (48.0, 48.0)); // 여백 24 × 2
    }

    #[test]
    fn empty_input_is_fine() {
        assert!(arrange_rects(&[], WORK, 1.0).is_empty());
    }
}
