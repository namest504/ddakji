use std::sync::Mutex;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

/// 현재 언어의 트레이 메뉴 (#143). 언어가 바뀌면 [`rebuild_menu`]로 갈아 끼운다.
fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use crate::i18n::{resolve, tray};
    let lang = {
        let s = app.state::<Mutex<crate::store::Store>>();
        let setting = s.lock().unwrap().settings().language;
        resolve(&setting)
    };
    let new_note = MenuItemBuilder::with_id("new", tray(lang, "new")).build(app)?;
    let list = MenuItemBuilder::with_id("list", tray(lang, "list")).build(app)?;
    // "모든 노트 펼치기"는 "모음집 하나 = 창 하나" 불변식(#77)과 모순이라 제거됨.
    let show_all = MenuItemBuilder::with_id("show_all", tray(lang, "show_all")).build(app)?;
    let autostart = CheckMenuItemBuilder::with_id("autostart", tray(lang, "autostart"))
        .checked(app.autolaunch().is_enabled().unwrap_or(false))
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", tray(lang, "quit")).build(app)?;
    MenuBuilder::new(app)
        .items(&[&new_note, &list, &show_all])
        .separator()
        .item(&autostart)
        .separator()
        .item(&quit)
        .build()
}

/// 언어 변경 시 트레이 메뉴만 갈아 끼운다 — 아이콘·핸들러는 그대로.
pub fn rebuild_menu(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("main") {
        if let Ok(menu) = build_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("icon configured").clone())
        .tooltip("ddakji")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "new" => {
                let note = app
                    .state::<Mutex<crate::store::Store>>()
                    .lock()
                    .unwrap()
                    .create();
                if let Ok(note) = note {
                    let _ = crate::windows::open_note_window(app, &note);
                }
            }
            "list" => {
                let _ = crate::windows::open_list_window(app);
            }
            "show_all" => {
                let _ = crate::session::unhide_and_show_all(app);
            }
            "autostart" => {
                let al = app.autolaunch();
                if al.is_enabled().unwrap_or(false) {
                    let _ = al.disable();
                } else {
                    let _ = al.enable();
                }
                // 체크 표시는 메뉴를 다시 그려 반영 — 언어 변경(#143)과 같은 경로
                rebuild_menu(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
