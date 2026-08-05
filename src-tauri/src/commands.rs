use crate::store::{MetaPatch, Note, Settings, Store};
use crate::windows;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

type StoreState<'a> = State<'a, Mutex<Store>>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_notes(store: StoreState) -> Result<Vec<Note>, String> {
    Ok(store.lock().map_err(err)?.list())
}

// 창을 만들거나 파괴하는 커맨드는 반드시 async여야 한다. sync 커맨드는 메인 스레드에서
// 실행되는데, Windows에서 웹뷰 창 생성/파괴는 메인 스레드의 메시지 펌프를 기다리므로
// 데드락된다 (#8). async 커맨드는 별도 태스크에서 돌아 이벤트 루프로 정상 디스패치된다.
#[tauri::command]
pub async fn create_note(app: AppHandle, store: StoreState<'_>) -> Result<Note, String> {
    let note = store.lock().map_err(err)?.create().map_err(err)?;
    windows::open_note_window(&app, &note).map_err(err)?;
    Ok(note)
}

#[tauri::command]
pub fn save_body(store: StoreState, id: String, body: String) -> Result<Note, String> {
    store.lock().map_err(err)?.save_body(&id, &body).map_err(err)
}

#[tauri::command]
pub fn save_meta(store: StoreState, id: String, patch: MetaPatch) -> Result<Note, String> {
    store.lock().map_err(err)?.save_meta(&id, &patch).map_err(err)
}

#[tauri::command]
pub async fn delete_note(app: AppHandle, store: StoreState<'_>, id: String) -> Result<(), String> {
    store.lock().map_err(err)?.delete(&id).map_err(err)?;
    if let Some(win) = app.get_webview_window(&format!("note-{id}")) {
        win.destroy().map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_note(app: AppHandle, store: StoreState<'_>, id: String) -> Result<(), String> {
    let note = {
        let s = store.lock().map_err(err)?;
        s.save_meta(
            &id,
            &MetaPatch {
                hidden: Some(false),
                ..Default::default()
            },
        )
        .map_err(err)?
    };
    windows::open_note_window(&app, &note).map_err(err)
}

#[tauri::command]
pub async fn open_list(app: AppHandle) -> Result<(), String> {
    windows::open_list_window(&app).map_err(err)
}

#[tauri::command]
pub fn save_image(
    store: StoreState,
    id: String,
    ext: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    store.lock().map_err(err)?.save_asset(&id, &ext, &bytes).map_err(err)
}

#[tauri::command]
pub fn import_image(store: StoreState, id: String, path: String) -> Result<String, String> {
    store
        .lock()
        .map_err(err)?
        .import_asset(&id, std::path::Path::new(&path))
        .map_err(err)
}

#[tauri::command]
pub fn data_root(store: StoreState) -> Result<String, String> {
    Ok(store.lock().map_err(err)?.root().to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    crate::fonts::list_system_fonts()
}

#[tauri::command]
pub fn open_data_dir(store: StoreState) -> Result<(), String> {
    // 프런트의 opener open_path는 경로 스코프 권한이 따로 필요해 실패한다(#15 QA) —
    // Rust API로 직접 연다
    let root = store.lock().map_err(err)?.root().to_path_buf();
    tauri_plugin_opener::open_path(root, None::<&str>).map_err(err)
}

#[tauri::command]
pub fn get_settings(store: StoreState) -> Result<Settings, String> {
    Ok(store.lock().map_err(err)?.settings())
}

#[tauri::command]
pub fn save_settings(store: StoreState, settings: Settings) -> Result<(), String> {
    store.lock().map_err(err)?.set_settings(&settings).map_err(err)
}
