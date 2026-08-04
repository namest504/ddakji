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
    .skip_taskbar(true)
    .always_on_top(m.always_on_top)
    .inner_size(m.window.w, m.window.h)
    .position(x, y)
    .min_inner_size(220.0, 160.0)
    .build()?;
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
        .build()?;
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
