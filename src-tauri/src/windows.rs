use crate::store::Note;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn open_note_window(app: &AppHandle, note: &Note) -> tauri::Result<()> {
    let label = format!("note-{}", note.meta.id);
    if let Some(win) = app.get_webview_window(&label) {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    let m = &note.meta;
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
    .position(m.window.x, m.window.y)
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
