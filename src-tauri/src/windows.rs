use crate::store::{Note, WindowBounds};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Fallback top-left position used when a note's saved window position isn't
/// visible on any currently connected monitor.
const FALLBACK_POSITION: (f64, f64) = (100.0, 100.0);

/// Height (in logical px) of the strip at the top of a note window that we
/// require to be reachable — this is where the (custom, `decorations(false)`)
/// title bar / drag handle lives, so it must land on-screen for the window to
/// be movable/closable by the user.
const TITLE_BAR_HEIGHT: f64 = 40.0;

/// Decides where to place a note window given its saved bounds and the
/// logical-pixel rects of the currently available monitors.
///
/// `monitors` entries are `(x, y, w, h)` in logical px. If the saved
/// position's title-bar strip (the top `TITLE_BAR_HEIGHT` px, full width)
/// overlaps any monitor by at least `TITLE_BAR_HEIGHT` px in both
/// dimensions, the saved position is kept as-is. Otherwise the note would
/// reopen off-screen with no way to recover it, so we fall back to
/// `FALLBACK_POSITION` (saved size is always preserved by the caller).
///
/// An empty monitor list (e.g. headless/CI environments where monitor
/// enumeration isn't available) is treated as "can't tell" and the saved
/// position is returned unchanged rather than forcing a reset.
pub fn visible_position(saved: &WindowBounds, monitors: &[(f64, f64, f64, f64)]) -> (f64, f64) {
    if monitors.is_empty() {
        return (saved.x, saved.y);
    }

    let title_left = saved.x;
    let title_right = saved.x + saved.w;
    let title_top = saved.y;
    let title_bottom = saved.y + TITLE_BAR_HEIGHT;

    let visible = monitors.iter().any(|&(mx, my, mw, mh)| {
        let overlap_w = title_right.min(mx + mw) - title_left.max(mx);
        let overlap_h = title_bottom.min(my + mh) - title_top.max(my);
        overlap_w >= TITLE_BAR_HEIGHT && overlap_h >= TITLE_BAR_HEIGHT
    });

    if visible {
        (saved.x, saved.y)
    } else {
        FALLBACK_POSITION
    }
}

/// Converts Tauri's physical-pixel monitor rects to logical-pixel rects
/// using each monitor's own scale factor.
fn logical_monitor_rects(app: &AppHandle) -> Vec<(f64, f64, f64, f64)> {
    app.available_monitors()
        .map(|monitors| {
            monitors
                .iter()
                .map(|m| {
                    let sf = m.scale_factor();
                    let pos = m.position();
                    let size = m.size();
                    (
                        pos.x as f64 / sf,
                        pos.y as f64 / sf,
                        size.width as f64 / sf,
                        size.height as f64 / sf,
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn open_note_window(app: &AppHandle, note: &Note) -> tauri::Result<()> {
    let label = format!("note-{}", note.meta.id);
    if let Some(win) = app.get_webview_window(&label) {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    let m = &note.meta;
    let monitors = logical_monitor_rects(app);
    let (x, y) = visible_position(&m.window, &monitors);
    WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("index.html?note={}", m.id).into()),
    )
    .title("stickdown")
    .decorations(false)
    // Tauri 드롭 핸들러가 웹뷰 드래그 이벤트를 가로채 에디터 내부 이미지 드래그가
    // 막힌다 — 끄고 파일 드롭도 에디터(HTML5)가 처리한다
    .disable_drag_drop_handler()
    // 노트는 Alt-Tab/작업표시줄에서 제외 — 대표 스텁 창 하나가 앱을 대신한다
    .skip_taskbar(true)
    // 웹뷰가 그리기 전 흰 배경이 잠깐 노출되는 것을 막는다 — 프런트가 마운트 후 show()
    .visible(false)
    // Liquid Glass(#20): 투명 창 + OS 블러 위에 CSS 반투명 틴트 — Windows 전용.
    // 컴포지터 없는 리눅스(X11/Xvfb)에서 ARGB 창은 검게 렌더된다.
    .transparent(cfg!(target_os = "windows"))
    .always_on_top(m.always_on_top)
    .inner_size(m.window.w, m.window.h)
    .position(x, y)
    .min_inner_size(220.0, 160.0)
    .build()
    .map(|w| apply_glass(&w))?;
    Ok(())
}

/// Windows에서 Acrylic 블러 적용. 실패(Win10 구버전 등)해도 앱은 계속 —
/// CSS 틴트만으로 동작한다. 틴트는 중립 회색: 라이트/다크 CSS가 위에서 색을 결정.
fn apply_glass(win: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    let _ = window_vibrancy::apply_acrylic(win, Some((160, 160, 160, 60)));
    #[cfg(not(target_os = "windows"))]
    let _ = win;
}

/// Alt-Tab/작업표시줄용 대표 창. 화면 밖에 상주하며 앱 항목을 하나로 유지한다 —
/// 사용자가 Alt-Tab이나 작업표시줄 아이콘으로 이 창을 활성화하면(Focused)
/// lib.rs가 모든 노트를 표시한다. 노트 창이 여럿이어도 Alt-Tab엔 이 창 하나만 보인다.
pub const STUB_LABEL: &str = "stickdown-main";

pub fn ensure_main_stub(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(STUB_LABEL).is_some() {
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(
        app,
        STUB_LABEL,
        WebviewUrl::App("index.html?view=stub".into()),
    )
    .title("stickdown")
    .decorations(false)
    .inner_size(260.0, 180.0)
    .position(-30000.0, -30000.0)
    // 생성 시점에 잠깐 화면에 그려지는 플래시 방지: 숨김으로 만들고
    // 화면 밖 위치를 확정한 뒤에 표시한다
    .visible(false)
    .focused(false)
    .build()?;
    let _ = w.set_position(tauri::LogicalPosition::new(-30000.0, -30000.0));
    // 화면 밖에 있어도 DWM이 콘텐츠를 합성하므로 Alt-Tab 썸네일에는
    // 이 창의 내용(최근 본 노트 미리보기)이 그대로 보인다.
    let _ = w.show();
    Ok(())
}

pub fn open_list_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("list") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "list", WebviewUrl::App("index.html?view=list".into()))
        .title("stickdown — 노트 목록")
        .inner_size(360.0, 480.0)
        .min_inner_size(280.0, 320.0)
        .visible(false)
        .transparent(cfg!(target_os = "windows"))
        .build()
        .map(|w| apply_glass(&w))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bounds(x: f64, y: f64, w: f64, h: f64) -> WindowBounds {
        WindowBounds { x, y, w, h }
    }

    #[test]
    fn saved_rect_inside_monitor_is_unchanged() {
        let saved = bounds(100.0, 100.0, 320.0, 340.0);
        let monitors = [(0.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(visible_position(&saved, &monitors), (100.0, 100.0));
    }

    #[test]
    fn saved_rect_fully_off_screen_falls_back() {
        let saved = bounds(5000.0, 5000.0, 320.0, 340.0);
        let monitors = [(0.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(visible_position(&saved, &monitors), FALLBACK_POSITION);
    }

    #[test]
    fn empty_monitor_list_leaves_saved_position_unchanged() {
        // Headless/CI edge case: can't tell what's visible, don't force a reset.
        let saved = bounds(5000.0, 5000.0, 320.0, 340.0);
        let monitors: [(f64, f64, f64, f64); 0] = [];
        assert_eq!(visible_position(&saved, &monitors), (5000.0, 5000.0));
    }

    #[test]
    fn saved_rect_on_disconnected_secondary_monitor_falls_back() {
        // Note was last positioned on a second monitor to the right that is
        // now unplugged; only the primary 1920x1080 monitor remains.
        let saved = bounds(2100.0, 200.0, 320.0, 340.0);
        let monitors = [(0.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(visible_position(&saved, &monitors), FALLBACK_POSITION);
    }

    #[test]
    fn saved_rect_straddling_monitor_edge_stays_if_title_bar_reachable() {
        // Most of the window hangs off the right edge, but enough of the
        // title bar (>= 40px in both dimensions) remains on-screen to grab.
        let saved = bounds(1870.0, 100.0, 320.0, 340.0);
        let monitors = [(0.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(visible_position(&saved, &monitors), (1870.0, 100.0));
    }

    #[test]
    fn saved_rect_with_title_bar_barely_below_threshold_falls_back() {
        // Only ~10px of title-bar width remains reachable — below the ~40px
        // floor — so this should be treated as unrecoverable.
        let saved = bounds(1910.0, 100.0, 320.0, 340.0);
        let monitors = [(0.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(visible_position(&saved, &monitors), FALLBACK_POSITION);
    }

    #[test]
    fn saved_rect_visible_on_second_of_multiple_monitors() {
        let saved = bounds(2020.0, 100.0, 320.0, 340.0);
        let monitors = [(0.0, 0.0, 1920.0, 1080.0), (1920.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(visible_position(&saved, &monitors), (2020.0, 100.0));
    }
}
