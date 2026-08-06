use crate::store::{MetaPatch, Note, Settings, Store};
use crate::windows;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

type StoreState<'a> = State<'a, Mutex<Store>>;

/// 마지막으로 본(포커스한) 노트 id — Alt-Tab 썸네일 미리보기용 (세션 한정)
pub struct LastViewed(pub Mutex<Option<String>>);

/// 식별자 폴더(%APPDATA%/com.stickdown.app) — storage-path.txt 포인터 저장 위치
pub struct IdDir(pub std::path::PathBuf);

/// 창 label → 표시 중인 노트 id (#25 그룹 넘기기로 창-노트가 동적이 됨)
pub struct WindowNotes(pub Mutex<std::collections::HashMap<String, String>>);

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// 노트 파일이 밖에서 삭제된 경우를 프런트가 구분할 수 있게 하는 마커.
// 프런트는 이 에러를 받으면 좀비 창을 만들지 않고 창을 닫는다.
fn err_io(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        "NOTE_NOT_FOUND".into()
    } else {
        e.to_string()
    }
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
    store.lock().map_err(err)?.save_body(&id, &body).map_err(err_io)
}

#[tauri::command]
pub fn save_meta(app: AppHandle, store: StoreState, id: String, patch: MetaPatch) -> Result<Note, String> {
    let group_changed = patch.group.is_some() || patch.group_order.is_some();
    let n = store.lock().map_err(err)?.save_meta(&id, &patch).map_err(err_io)?;
    if group_changed {
        use tauri::Emitter;
        let _ = app.emit("groups-changed", ());
    }
    Ok(n)
}

#[tauri::command]
pub async fn delete_note(
    app: AppHandle,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    id: String,
) -> Result<(), String> {
    store.lock().map_err(err)?.delete(&id).map_err(err)?;
    let label = wn
        .0
        .lock()
        .map_err(err)?
        .iter()
        .find(|(_, nid)| **nid == id)
        .map(|(l, _)| l.clone());
    if let Some(l) = label {
        if let Some(win) = app.get_webview_window(&l) {
            win.destroy().map_err(err)?;
        }
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
pub fn set_storage_path(
    app: AppHandle,
    store: StoreState,
    id_dir: State<IdDir>,
    new_path: String,
) -> Result<(), String> {
    let new_root = std::path::PathBuf::from(new_path.trim());
    if new_root.as_os_str().is_empty() {
        return Err("경로가 비어 있습니다".into());
    }
    let current = store.lock().map_err(err)?.root().to_path_buf();
    crate::store::move_storage(&id_dir.0, &current, &new_root).map_err(err)?;
    // 새 경로로 깨끗하게 재기동
    app.restart();
}

#[tauri::command]
pub fn set_last_viewed(state: State<LastViewed>, id: String) {
    if let Ok(mut g) = state.0.lock() {
        *g = Some(id);
    }
}

#[tauri::command]
pub fn get_last_viewed(state: State<LastViewed>, store: StoreState) -> Result<Option<Note>, String> {
    let id = state.0.lock().map_err(err)?.clone();
    let s = store.lock().map_err(err)?;
    // 아직 본 노트가 없으면 가장 최근 수정된 노트로
    Ok(id.and_then(|i| s.load(&i)).or_else(|| s.list().into_iter().next()))
}

#[tauri::command]
pub fn data_root(store: StoreState) -> Result<String, String> {
    Ok(store.lock().map_err(err)?.root().to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::err_io;

    #[test]
    fn not_found_maps_to_marker() {
        let nf = std::io::Error::new(std::io::ErrorKind::NotFound, "x");
        assert_eq!(err_io(nf), "NOTE_NOT_FOUND");
        let other = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        assert_ne!(err_io(other), "NOTE_NOT_FOUND");
    }
}

/// 이동한 창(a)이 대상 창(b)과 겹치는 비율 — a 면적 기준 0.0~1.0
pub fn overlap_ratio(a: (f64, f64, f64, f64), b: (f64, f64, f64, f64)) -> f64 {
    let (ax, ay, aw, ah) = a;
    let (bx, by, bw, bh) = b;
    let iw = (ax + aw).min(bx + bw) - ax.max(bx);
    let ih = (ay + ah).min(by + bh) - ay.max(by);
    if iw <= 0.0 || ih <= 0.0 || aw <= 0.0 || ah <= 0.0 {
        return 0.0;
    }
    (iw * ih) / (aw * ah)
}

/// 드래그 합치기 시 새 그룹 이름 — "새 그룹 {번호}" 순번 자동 부여
pub fn next_new_group_name(existing: &[String]) -> String {
    let mut n = 1u32;
    loop {
        let name = format!("새 그룹 {n}");
        if !existing.iter().any(|g| g == &name) {
            return name;
        }
        n += 1;
    }
}

#[tauri::command]
pub fn list_groups(store: StoreState) -> Result<Vec<String>, String> {
    Ok(store.lock().map_err(err)?.group_names())
}

/// 그룹 내 이전/다음 노트로 이동. 대상이 이미 다른 창에 열려 있으면 그 창을
/// 포커스하고 None, 아니면 현재 창의 매핑을 바꾸고 대상 노트를 반환한다.
#[tauri::command]
pub async fn nav_group(
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    dir: i32,
) -> Result<Option<Note>, String> {
    let label = window.label().to_string();
    let current_id = wn
        .0
        .lock()
        .map_err(err)?
        .get(&label)
        .cloned()
        .ok_or("window not mapped")?;
    let notes = {
        let s = store.lock().map_err(err)?;
        let cur = s.load(&current_id).ok_or("note gone")?;
        let Some(g) = cur.meta.group.clone() else {
            return Ok(None);
        };
        s.group_notes(&g)
    };
    if notes.len() < 2 {
        return Ok(None);
    }
    let idx = notes.iter().position(|n| n.meta.id == current_id).unwrap_or(0) as i32;
    let len = notes.len() as i32;
    let target = notes[(((idx + dir) % len + len) % len) as usize].clone();
    let other = wn
        .0
        .lock()
        .map_err(err)?
        .iter()
        .find(|(l, id)| **id == target.meta.id && **l != label)
        .map(|(l, _)| l.clone());
    if let Some(l) = other {
        if let Some(w) = window.app_handle().get_webview_window(&l) {
            let _ = w.show();
            let _ = w.set_focus();
            return Ok(None);
        }
    }
    wn.0.lock().map_err(err)?.insert(label, target.meta.id.clone());
    Ok(Some(target))
}

#[tauri::command]
pub fn group_members(store: StoreState, id: String) -> Result<Vec<String>, String> {
    let s = store.lock().map_err(err)?;
    let Some(n) = s.load(&id) else { return Ok(vec![]) };
    let Some(g) = n.meta.group else { return Ok(vec![]) };
    Ok(s.group_notes(&g).into_iter().map(|n| n.meta.id).collect())
}

/// 그룹 내 특정 노트로 점프 — nav_group과 동일한 "열려 있으면 그 창 포커스" 정책
#[tauri::command]
pub async fn nav_to(
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    id: String,
) -> Result<Option<Note>, String> {
    let label = window.label().to_string();
    let target = {
        let s = store.lock().map_err(err)?;
        s.load(&id).ok_or("note gone")?
    };
    let other = wn
        .0
        .lock()
        .map_err(err)?
        .iter()
        .find(|(l, nid)| **nid == id && **l != label)
        .map(|(l, _)| l.clone());
    if let Some(l) = other {
        if let Some(w) = window.app_handle().get_webview_window(&l) {
            let _ = w.show();
            let _ = w.set_focus();
            return Ok(None);
        }
    }
    wn.0.lock().map_err(err)?.insert(label, target.meta.id.clone());
    Ok(Some(target))
}

/// 드래그 종료 후 호출 — 다른 노트 창과 충분히 겹치면(60%+) 그 노트와 같은
/// 모음집으로 묶고, 끌던 창은 닫는다 (#25 G4)
#[tauri::command]
pub async fn check_merge(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<bool, String> {
    use tauri::Emitter;
    let label = window.label().to_string();
    let moved_id = wn
        .0
        .lock()
        .map_err(err)?
        .get(&label)
        .cloned()
        .ok_or("window not mapped")?;
    let ap = window.outer_position().map_err(err)?;
    let asz = window.outer_size().map_err(err)?;
    let a = (ap.x as f64, ap.y as f64, asz.width as f64, asz.height as f64);
    let entries: Vec<(String, String)> = wn
        .0
        .lock()
        .map_err(err)?
        .iter()
        .filter(|(l, _)| **l != label)
        .map(|(l, id)| (l.clone(), id.clone()))
        .collect();
    let mut best: Option<(String, String, f64, (f64, f64, f64, f64))> = None;
    for (l, id) in entries {
        let Some(w) = app.get_webview_window(&l) else { continue };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let (Ok(p), Ok(sz)) = (w.outer_position(), w.outer_size()) else { continue };
        let b = (p.x as f64, p.y as f64, sz.width as f64, sz.height as f64);
        let r = overlap_ratio(a, b);
        if r > best.as_ref().map(|x| x.2).unwrap_or(0.0) {
            best = Some((l, id, r, b));
        }
    }
    let Some((target_label, target_id, ratio, tb)) = best else { return Ok(false) };
    if ratio < 0.6 || target_id == moved_id {
        return Ok(false);
    }
    let mut changed = false;
    {
        let s = store.lock().map_err(err)?;
        let target = s.load(&target_id).ok_or("target gone")?;
        let moved = s.load(&moved_id).ok_or("note gone")?;
        // 이미 같은 그룹이면 메타 변경 없이 창만 흡수한다
        if target.meta.group.is_none() || target.meta.group != moved.meta.group {
            let group = match target.meta.group.clone() {
                Some(g) => g,
                None => {
                    let name = next_new_group_name(&s.group_names());
                    s.save_meta(
                        &target_id,
                        &MetaPatch { group: Some(name.clone()), ..Default::default() },
                    )
                    .map_err(err)?;
                    name
                }
            };
            s.save_meta(&moved_id, &MetaPatch { group: Some(group), ..Default::default() })
                .map_err(err)?;
            changed = true;
        }
    }
    // 흡수 애니메이션: 끌던 창이 대상 중심으로 미끄러져 들어간 뒤 닫힌다
    let (tcx, tcy) = (tb.0 + tb.2 / 2.0, tb.1 + tb.3 / 2.0);
    let (scx, scy) = (a.0 + a.2 / 2.0, a.1 + a.3 / 2.0);
    for i in 1..=8u32 {
        let t = i as f64 / 8.0;
        let e = t * t * (3.0 - 2.0 * t); // smoothstep
        let cx = scx + (tcx - scx) * e;
        let cy = scy + (tcy - scy) * e;
        let _ = window.set_position(tauri::PhysicalPosition::new(
            (cx - a.2 / 2.0) as i32,
            (cy - a.3 / 2.0) as i32,
        ));
        std::thread::sleep(std::time::Duration::from_millis(14));
    }
    if let Some(w) = app.get_webview_window(&target_label) {
        let _ = w.set_focus();
    }
    if changed {
        let _ = app.emit("groups-changed", ());
    }
    let _ = window.destroy();
    Ok(true)
}

/// 현재 노트를 새 창으로 분리 — 원래 창은 그룹의 다음 노트로 전환 (#25)
#[tauri::command]
pub async fn pop_out(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<Option<Note>, String> {
    let label = window.label().to_string();
    let current_id = wn
        .0
        .lock()
        .map_err(err)?
        .get(&label)
        .cloned()
        .ok_or("window not mapped")?;
    let (mut cur, next) = {
        let s = store.lock().map_err(err)?;
        let cur = s.load(&current_id).ok_or("note gone")?;
        let Some(g) = cur.meta.group.clone() else { return Ok(None) };
        let ns = s.group_notes(&g);
        if ns.len() < 2 {
            return Ok(None);
        }
        let idx = ns.iter().position(|n| n.meta.id == current_id).unwrap_or(0);
        let next = ns[(idx + 1) % ns.len()].clone();
        (cur, next)
    };
    // 원래 창은 다음 노트를 표시
    wn.0.lock().map_err(err)?.insert(label, next.meta.id.clone());
    // 분리 창은 살짝 어긋난 위치에
    cur.meta.window.x += 28.0;
    cur.meta.window.y += 28.0;
    crate::windows::open_note_window(&app, &cur).map_err(err)?;
    Ok(Some(next))
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
pub fn save_settings(app: AppHandle, store: StoreState, settings: Settings) -> Result<(), String> {
    store.lock().map_err(err)?.set_settings(&settings).map_err(err)?;
    // 다른 창(노트들)이 테마·즐겨찾기 변경을 즉시 반영하도록 알린다
    use tauri::Emitter;
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[cfg(test)]
mod geom_tests {
    use super::{next_new_group_name, overlap_ratio};

    #[test]
    fn overlap_full_partial_none() {
        let a = (0.0, 0.0, 100.0, 100.0);
        assert!((overlap_ratio(a, (0.0, 0.0, 100.0, 100.0)) - 1.0).abs() < 1e-9);
        assert!((overlap_ratio(a, (50.0, 0.0, 100.0, 100.0)) - 0.5).abs() < 1e-9);
        assert_eq!(overlap_ratio(a, (200.0, 200.0, 100.0, 100.0)), 0.0);
    }

    #[test]
    fn new_group_names_are_numbered() {
        assert_eq!(next_new_group_name(&[]), "새 그룹 1");
        assert_eq!(
            next_new_group_name(&["새 그룹 1".into(), "기타".into()]),
            "새 그룹 2"
        );
        assert_eq!(
            next_new_group_name(&["새 그룹 1".into(), "새 그룹 2".into()]),
            "새 그룹 3"
        );
    }
}
