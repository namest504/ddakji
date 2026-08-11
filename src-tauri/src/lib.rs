//! ddakji — 마크다운 스티키 노트.
//!
//! 이 파일은 컴포지션 루트다: 플러그인·커맨드·창 이벤트를 배선하기만 하고,
//! 도메인 로직은 각 모듈이 갖는다.
//!
//! - [`store`] 디스크의 노트·에셋·설정 (유일한 저장 경로)
//! - [`session`] 어떤 노트를 창으로 열지 결정하는 복원 정책
//! - [`windows`] 창 생성·배치 규칙, [`commands`] 프런트에 노출되는 API
//! - [`error`] 프런트와의 에러 계약 (`NOTE_NOT_FOUND` 마커 포함)

pub mod args;
pub mod bridge;
pub mod commands;
pub mod error;
pub mod fonts;
pub mod session;
pub mod store;
pub mod tray;
pub mod windows;

pub use error::{Error, Result};
pub use session::show_all_notes;

use std::sync::Mutex;
use store::{MetaPatch, Store};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // CLI의 --open 액션 (#12): 해당 노트만 열고 끝낸다
            if let Some(id) = args::open_arg(&args) {
                let _ = commands::open_note_by_id(app, id);
                return;
            }
            // 그 외 두 번째 실행: 숨겨지지 않은 노트 창 모두 표시
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
            commands::import_markdown,
            commands::data_root,
            commands::get_settings,
            commands::save_settings,
            commands::open_data_dir,
            commands::reveal_note,
            commands::list_system_fonts,
            commands::set_last_viewed,
            commands::get_last_viewed,
            commands::set_storage_path,
            commands::nav_group,
            commands::nav_to,
            commands::group_members,
            commands::check_merge,
            commands::merge_preview,
            commands::pop_out,
            commands::hide_note,
            commands::hide_group,
            commands::list_groups,
        ])
        .setup(setup)
        .on_window_event(on_window_event)
        .build(tauri::generate_context!())
        .expect("error while running ddakji")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                // 창이 전부 닫혀도(숨김이 아니라 destroy로 전부 사라져도) 트레이 상주를 위해
                // 종료를 막는다. 단, app.exit()/restart()로 명시적으로 요청된 경우(code: Some)는
                // 실제 종료를 허용한다 (트레이 "종료" 메뉴 등).
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

/// 앱 상태 준비 + 첫 창 배치. 실패하면 앱이 뜨지 않는다.
fn setup(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let id_dir = app.path().app_data_dir()?;
    // 기본 %APPDATA%/Ddakji (충돌 시 식별자 폴더), 설정으로 변경 가능
    let root = store::resolve_data_root(&id_dir);
    let store = Store::new(&root)?;
    let notes = store.list();
    // 커스텀 저장 경로에서도 이미지(asset)가 로드되도록 스코프 허용
    let _ = app
        .asset_protocol_scope()
        .allow_directory(root.join("assets"), true);
    app.manage(Mutex::new(store));
    app.manage(commands::IdDir(id_dir));
    app.manage(commands::LastViewed(Mutex::new(None)));
    app.manage(commands::WindowNotes(Mutex::new(
        std::collections::HashMap::new(),
    )));
    tray::create_tray(app.handle())?;
    // 외부 변경 브리지 (#12) — CLI 등 밖에서 바뀐 파일을 이벤트로 번역
    bridge::spawn(app.handle().clone());
    // Alt-Tab/작업표시줄 대표 창 (노트들은 skip_taskbar)
    windows::ensure_main_stub(app.handle())?;
    if notes.is_empty() {
        let s = app.state::<Mutex<Store>>();
        let note = s.lock().expect("store lock").create()?;
        windows::open_note_window(app.handle(), &note)?;
        return Ok(());
    }
    for n in session::startup_notes(&notes) {
        windows::open_note_window(app.handle(), n)?;
    }
    // 앱이 꺼진 상태에서 `ddakji.exe --open <id>`로 시작된 경우 (#12)
    let argv: Vec<String> = std::env::args().collect();
    if let Some(id) = args::open_arg(&argv) {
        let _ = commands::open_note_by_id(app.handle(), id);
    }
    Ok(())
}

fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == windows::STUB_LABEL {
        on_stub_event(window, event);
        return;
    }
    let app = window.app_handle();
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            // 창이 표시 중인 노트는 매핑이 진실 (#25 — label은 불변, 노트는 동적)
            let id = app.try_state::<commands::WindowNotes>().and_then(|wn| {
                wn.0.lock()
                    .ok()
                    .and_then(|m| m.get(window.label()).cloned())
            });
            if let Some(id) = id {
                // 닫기 = 숨김 (삭제 아님), 트레이 상주
                api.prevent_close();
                let _ = window.hide();
                if let Ok(s) = app.state::<Mutex<Store>>().lock() {
                    let _ = s.save_meta(
                        &id,
                        &MetaPatch {
                            hidden: Some(true),
                            ..Default::default()
                        },
                    );
                }
            }
        }
        tauri::WindowEvent::Destroyed => {
            if let Some(wn) = app.try_state::<commands::WindowNotes>() {
                if let Ok(mut m) = wn.0.lock() {
                    m.remove(window.label());
                }
            }
        }
        _ => {}
    }
}

/// Alt-Tab·작업표시줄 대표 창(스텁)의 이벤트. 스텁은 화면 밖에 상주하며
/// 앱 항목을 하나로 유지하는 역할만 한다.
fn on_stub_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    match event {
        // 앱을 선택하면(복원·포커스) 스텁은 화면 밖으로 되돌리고 노트를 표시한다
        tauri::WindowEvent::Focused(true) => {
            // 셸이 화면 안으로 끌어왔을 수 있으니 항상 화면 밖으로
            let _ = window.set_position(tauri::LogicalPosition::new(-30000.0, -30000.0));
            let _ = show_all_notes(window.app_handle());
        }
        // 작업 표시줄에서 "창 닫기" = 명시적 종료 의도 — 앱을 완전히 끝낸다
        tauri::WindowEvent::CloseRequested { .. } => window.app_handle().exit(0),
        _ => {}
    }
}
