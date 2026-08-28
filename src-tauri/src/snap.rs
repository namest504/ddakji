//! 자석 스냅 (#175) — 드래그를 놓는 순간, 가장자리가 가까우면 착 정렬한다.
//!
//! Windows에서 창 드래그는 OS의 모달 루프가 소유하므로 드래그 **중**에
//! 좌표를 당기면 창이 튄다. 그래서 합치기(#115)와 같은 시점 — 버튼
//! 릴리스 — 에 한 번만 움직인다. 커서가 상대 창 위면 합치기, 밖이면 스냅.

/// (x, y, w, h) — commands의 창 사각형 표현과 동일 (물리 픽셀)
pub type Rect = (f64, f64, f64, f64);

/// 스냅 판정. 축별로 독립 — x는 세로 가장자리들, y는 가로 가장자리들에서
/// 가장 가까운 후보를 고른다. 창 후보는 **맞닿기**(내 왼쪽↔남의 오른쪽)와
/// **정렬**(왼쪽↔왼쪽) 둘 다, 화면은 안쪽 정렬만.
///
/// 창 후보에는 수직(반대 축) 근접 조건이 붙는다 — 화면 반대편에 있는
/// 창의 가장자리에 끌려가면 자석이 아니라 순간이동이다.
pub fn snap_delta(
    moving: Rect,
    others: &[Rect],
    screen: Option<Rect>,
    threshold: f64,
) -> Option<(f64, f64)> {
    let (mx, my, mw, mh) = moving;
    let (ml, mr, mt, mb) = (mx, mx + mw, my, my + mh);

    let mut best_dx: Option<f64> = None;
    let mut best_dy: Option<f64> = None;
    let consider = |slot: &mut Option<f64>, d: f64| {
        if d.abs() <= threshold && slot.map(|b| d.abs() < b.abs()).unwrap_or(true) {
            *slot = Some(d);
        }
    };

    for &(ox, oy, ow, oh) in others {
        let (ol, or_, ot, ob) = (ox, ox + ow, oy, oy + oh);
        // 반대 축 근접: 범위가 겹치거나 틈이 임계 이내여야 그 축 후보로 인정
        let near_v = mt < ob + threshold && ot < mb + threshold;
        let near_h = ml < or_ + threshold && ol < mr + threshold;
        if near_v {
            consider(&mut best_dx, or_ - ml); // 맞닿기: 내 왼쪽 ↔ 남 오른쪽
            consider(&mut best_dx, ol - mr); // 맞닿기: 내 오른쪽 ↔ 남 왼쪽
            consider(&mut best_dx, ol - ml); // 정렬: 왼쪽끼리
            consider(&mut best_dx, or_ - mr); // 정렬: 오른쪽끼리
        }
        if near_h {
            consider(&mut best_dy, ob - mt);
            consider(&mut best_dy, ot - mb);
            consider(&mut best_dy, ot - mt);
            consider(&mut best_dy, ob - mb);
        }
    }
    if let Some((sx, sy, sw, sh)) = screen {
        consider(&mut best_dx, sx - ml);
        consider(&mut best_dx, (sx + sw) - mr);
        consider(&mut best_dy, sy - mt);
        consider(&mut best_dy, (sy + sh) - mb);
    }

    match (best_dx, best_dy) {
        (None, None) => None,
        (dx, dy) => Some((dx.unwrap_or(0.0), dy.unwrap_or(0.0))),
    }
}

/// 이 창이 속한 모니터의 작업영역(작업표시줄 제외). Tauri Monitor에는
/// 작업영역이 없어 Windows에서는 Win32로 직접 읽는다.
#[cfg(windows)]
pub fn work_area(window: &tauri::WebviewWindow) -> Option<Rect> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    let hwnd = HWND(window.hwnd().ok()?.0);
    unsafe {
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(mon, &mut info).as_bool() {
            return None;
        }
        let r = info.rcWork;
        Some((
            r.left as f64,
            r.top as f64,
            (r.right - r.left) as f64,
            (r.bottom - r.top) as f64,
        ))
    }
}

#[cfg(not(windows))]
pub fn work_area(window: &tauri::WebviewWindow) -> Option<Rect> {
    let m = window.current_monitor().ok().flatten()?;
    let p = m.position();
    let s = m.size();
    Some((p.x as f64, p.y as f64, s.width as f64, s.height as f64))
}

#[cfg(test)]
mod tests {
    use super::*;
    const T: f64 = 16.0;

    #[test]
    fn adjacency_snaps_my_left_to_their_right() {
        // 남의 창(0,0,300,200) 오른쪽에 10px 틈을 두고 놓음 → 틈이 닫힌다
        let d = snap_delta(
            (310.0, 50.0, 200.0, 150.0),
            &[(0.0, 0.0, 300.0, 200.0)],
            None,
            T,
        );
        assert_eq!(d, Some((-10.0, 50.0 - 50.0)));
    }

    #[test]
    fn alignment_snaps_left_edges_and_top_edges_independently() {
        // 왼쪽끼리 6px, 위끼리 5px 어긋남 — 두 축 모두 정렬
        let d = snap_delta(
            (6.0, 205.0, 200.0, 100.0),
            &[(0.0, 0.0, 300.0, 200.0)],
            None,
            T,
        );
        assert_eq!(d, Some((-6.0, -5.0)));
    }

    #[test]
    fn far_edges_do_not_attract() {
        // 임계 밖이면 어느 축도 스냅 없음
        let d = snap_delta(
            (400.0, 400.0, 100.0, 100.0),
            &[(0.0, 0.0, 100.0, 100.0)],
            None,
            T,
        );
        assert_eq!(d, None);
    }

    #[test]
    fn perpendicular_gate_blocks_teleports() {
        // x 가장자리는 3px로 가깝지만 세로로 한참 떨어진 창 — 끌려가면 안 된다
        let d = snap_delta(
            (103.0, 900.0, 100.0, 100.0),
            &[(0.0, 0.0, 100.0, 100.0)],
            None,
            T,
        );
        assert_eq!(d, None);
    }

    #[test]
    fn nearest_candidate_wins() {
        // 왼쪽 정렬(8px)보다 맞닿기(3px)가 가깝다
        let d = snap_delta(
            (103.0, 0.0, 100.0, 100.0),
            &[(0.0, 0.0, 100.0, 100.0), (95.0, 0.0, 1.0, 100.0)],
            None,
            T,
        );
        assert_eq!(d.unwrap().0, -3.0);
    }

    #[test]
    fn screen_edges_snap_without_perpendicular_gate() {
        let screen = Some((0.0, 0.0, 1920.0, 1040.0));
        let d = snap_delta((5.0, 500.0, 200.0, 100.0), &[], screen, T);
        assert_eq!(d, Some((-5.0, 0.0)));
        let d2 = snap_delta((1710.0, 933.0, 200.0, 100.0), &[], screen, T);
        assert_eq!(d2, Some((10.0, 7.0)));
    }
}
