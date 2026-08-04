use crate::store::{MetaPatch, Note, Store};
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

#[tauri::command]
pub fn create_note(app: AppHandle, store: StoreState) -> Result<Note, String> {
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
pub fn delete_note(app: AppHandle, store: StoreState, id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&format!("note-{id}")) {
        win.destroy().map_err(err)?;
    }
    store.lock().map_err(err)?.delete(&id).map_err(err)
}

#[tauri::command]
pub fn open_note(app: AppHandle, store: StoreState, id: String) -> Result<(), String> {
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
pub fn open_list(app: AppHandle) -> Result<(), String> {
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
