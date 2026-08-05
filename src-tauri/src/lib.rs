pub mod commands;
pub mod fonts;
pub mod store;
pub mod tray;
pub mod windows;

use std::sync::Mutex;
use store::{MetaPatch, Store};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 두 번째 실행 시: 숨겨지지 않은 노트 창 모두 표시
            let _ = crate::show_all_notes(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_notes,
            commands::create_note,
            commands::save_body,
            commands::save_meta,
            commands::delete_note,
            commands::open_note,
            commands::open_list,
            commands::save_image,
            commands::import_image,
            commands::data_root,
            commands::get_settings,
            commands::save_settings,
            commands::open_data_dir,
            commands::list_system_fonts,
        ])
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let store = Store::new(&root)?;
            let notes = store.list();
            app.manage(Mutex::new(store));
            tray::create_tray(app.handle())?;
            // Alt-Tab/작업표시줄 대표 창 (노트들은 skip_taskbar)
            windows::ensure_main_stub(app.handle())?;
            let visible: Vec<_> = notes.iter().filter(|n| !n.meta.hidden).collect();
            if notes.is_empty() {
                let s = app.state::<Mutex<Store>>();
                let note = s.lock().unwrap().create()?;
                windows::open_note_window(app.handle(), &note)?;
            } else {
                for n in visible {
                    windows::open_note_window(app.handle(), n)?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == windows::STUB_LABEL {
                match event {
                    // Alt-Tab·작업표시줄에서 앱을 선택하면 모든 노트를 표시한다
                    tauri::WindowEvent::Focused(true) => {
                        let _ = crate::show_all_notes(&window.app_handle());
                    }
                    // 스텁이 닫히면 Alt-Tab 항목이 사라진다 — 닫기 무시
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                    }
                    _ => {}
                }
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(id) = window.label().strip_prefix("note-") {
                    // 닫기 = 숨김 (삭제 아님), 트레이 상주
                    api.prevent_close();
                    let _ = window.hide();
                    let app = window.app_handle();
                    let s = app.state::<Mutex<Store>>();
                    let _ = s.lock().unwrap().save_meta(
                        id,
                        &MetaPatch {
                            hidden: Some(true),
                            ..Default::default()
                        },
                    );
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running stickdown")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                // 창이 전부 닫혀도(숨김이 아니라 destroy로 전부 사라져도) 트레이 상주를 위해
                // 종료를 막는다. 단, app.exit()/restart()로 명시적으로 요청된 경우(code: Some)는
                // 실제 종료를 허용한다 (Task 5의 트레이 "종료" 메뉴 등).
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

pub fn show_all_notes(app: &tauri::AppHandle) -> tauri::Result<()> {
    let s = app.state::<Mutex<Store>>();
    let notes: Vec<_> = {
        let store = s.lock().unwrap();
        store.list()
    };
    for n in notes {
        let n = {
            let store = s.lock().unwrap();
            store
                .save_meta(
                    &n.meta.id,
                    &MetaPatch {
                        hidden: Some(false),
                        ..Default::default()
                    },
                )
                .unwrap_or(n)
        };
        windows::open_note_window(app, &n)?;
    }
    Ok(())
}
