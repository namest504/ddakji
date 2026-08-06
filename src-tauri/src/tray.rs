use std::sync::Mutex;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let new_note = MenuItemBuilder::with_id("new", "새 노트").build(app)?;
    let list = MenuItemBuilder::with_id("list", "노트 목록").build(app)?;
    // 그룹 멤버까지 전부 개별 창으로 여는 명시적 동작 — 암묵 복원(두 번째 실행·
    // Alt-Tab)은 show_all_notes가 접힘을 유지한다 (#69)
    let show_all = MenuItemBuilder::with_id("show_all", "모든 노트 펼치기").build(app)?;
    let autostart = CheckMenuItemBuilder::with_id("autostart", "부팅 시 시작")
        .checked(app.autolaunch().is_enabled().unwrap_or(false))
        .build(app)?;
    let autostart_handle = autostart.clone();
    let quit = MenuItemBuilder::with_id("quit", "종료").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&new_note, &list, &show_all])
        .separator()
        .item(&autostart)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("icon configured").clone())
        .tooltip("stickdown")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "new" => {
                let note = app.state::<Mutex<crate::store::Store>>().lock().unwrap().create();
                if let Ok(note) = note {
                    let _ = crate::windows::open_note_window(app, &note);
                }
            }
            "list" => { let _ = crate::windows::open_list_window(app); }
            "show_all" => { let _ = crate::expand_all_notes(app); }
            "autostart" => {
                let al = app.autolaunch();
                if al.is_enabled().unwrap_or(false) { let _ = al.disable(); }
                else { let _ = al.enable(); }
                let _ = autostart_handle.set_checked(al.is_enabled().unwrap_or(false));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
