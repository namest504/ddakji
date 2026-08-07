use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::store::{MetaPatch, Note, Settings, Store};
use crate::windows;
use crate::{Error, Result};

type StoreState<'a> = State<'a, Mutex<Store>>;

/// 마지막으로 본(포커스한) 노트 id — Alt-Tab 썸네일 미리보기용 (세션 한정)
pub struct LastViewed(pub Mutex<Option<String>>);

/// 식별자 폴더(%APPDATA%/com.stickdown.app) — storage-path.txt 포인터 저장 위치
pub struct IdDir(pub std::path::PathBuf);

/// 창 label → 표시 중인 노트 id (#25 그룹 넘기기로 창-노트가 동적이 됨)
pub struct WindowNotes(pub Mutex<std::collections::HashMap<String, String>>);

/// 상태 잠금 — 다른 스레드가 패닉했을 때만 실패한다.
fn lock<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    m.lock().map_err(|_| Error::Poisoned)
}

#[tauri::command]
pub fn list_notes(store: StoreState) -> Result<Vec<Note>> {
    Ok(lock(&store)?.list())
}

// 창을 만들거나 파괴하는 커맨드는 반드시 async여야 한다. sync 커맨드는 메인 스레드에서
// 실행되는데, Windows에서 웹뷰 창 생성/파괴는 메인 스레드의 메시지 펌프를 기다리므로
// 데드락된다 (#8). async 커맨드는 별도 태스크에서 돌아 이벤트 루프로 정상 디스패치된다.
#[tauri::command]
pub async fn create_note(app: AppHandle, store: StoreState<'_>) -> Result<Note> {
    let note = lock(&store)?.create()?;
    windows::open_note_window(&app, &note)?;
    Ok(note)
}

#[tauri::command]
pub fn save_body(store: StoreState, id: String, body: String) -> Result<Note> {
    lock(&store)?.save_body(&id, &body)
}

#[tauri::command]
pub fn save_meta(app: AppHandle, store: StoreState, id: String, patch: MetaPatch) -> Result<Note> {
    let group_changed = patch.group.is_some() || patch.group_order.is_some();
    let n = lock(&store)?.save_meta(&id, &patch)?;
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
) -> Result<()> {
    lock(&store)?.delete(&id)?;
    let label = lock(&wn.0)?
        .iter()
        .find(|(_, nid)| **nid == id)
        .map(|(l, _)| l.clone());
    if let Some(l) = label {
        if let Some(win) = app.get_webview_window(&l) {
            win.destroy()?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn open_note(app: AppHandle, store: StoreState<'_>, id: String) -> Result<()> {
    let note = {
        let s = lock(&store)?;
        s.save_meta(
            &id,
            &MetaPatch {
                hidden: Some(false),
                ..Default::default()
            },
        )?
    };
    Ok(windows::open_note_window(&app, &note)?)
}

#[tauri::command]
pub async fn open_list(app: AppHandle) -> Result<()> {
    Ok(windows::open_list_window(&app)?)
}

#[tauri::command]
pub fn save_image(store: StoreState, id: String, ext: String, bytes: Vec<u8>) -> Result<String> {
    lock(&store)?.save_asset(&id, &ext, &bytes)
}

// 창을 여는 커맨드이므로 async 필수 (#8 데드락 규칙)
#[tauri::command]
pub async fn import_markdown(app: AppHandle, store: StoreState<'_>, path: String) -> Result<Note> {
    let note = {
        let s = lock(&store)?;
        s.import_markdown_file(std::path::Path::new(&path))?
    };
    windows::open_note_window(&app, &note)?;
    Ok(note)
}

#[tauri::command]
pub fn import_image(store: StoreState, id: String, path: String) -> Result<String> {
    lock(&store)?.import_asset(&id, std::path::Path::new(&path))
}

#[tauri::command]
pub fn set_storage_path(
    app: AppHandle,
    store: StoreState,
    id_dir: State<IdDir>,
    new_path: String,
) -> Result<()> {
    let new_root = std::path::PathBuf::from(new_path.trim());
    if new_root.as_os_str().is_empty() {
        return Err(Error::Invalid("경로가 비어 있습니다".into()));
    }
    let current = lock(&store)?.root().to_path_buf();
    crate::store::move_storage(&id_dir.0, &current, &new_root)?;
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
pub fn get_last_viewed(state: State<LastViewed>, store: StoreState) -> Result<Option<Note>> {
    let id = lock(&state.0)?.clone();
    let s = lock(&store)?;
    // 아직 본 노트가 없으면 가장 최근 수정된 노트로
    Ok(id
        .and_then(|i| s.load(&i))
        .or_else(|| s.list().into_iter().next()))
}

#[tauri::command]
pub fn data_root(store: StoreState) -> Result<String> {
    Ok(lock(&store)?.root().to_string_lossy().into_owned())
}

/// 창 사각형 (x, y, w, h) — 물리 픽셀
type Rect = (f64, f64, f64, f64);

/// 합치기 후보: (창 label, 노트 id, 겹침 비율, 대상 사각형)
type MergeCandidate = (String, String, f64, Rect);

/// 이동한 창(a)이 대상 창(b)과 겹치는 비율 — a 면적 기준 0.0~1.0
pub fn overlap_ratio(a: Rect, b: Rect) -> f64 {
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
pub fn list_groups(store: StoreState) -> Result<Vec<String>> {
    Ok(lock(&store)?.group_names())
}

/// 그룹 내 이전/다음 노트로 이동. 대상이 이미 다른 창에 열려 있으면 그 창을
/// 포커스하고 None, 아니면 현재 창의 매핑을 바꾸고 대상 노트를 반환한다.
#[tauri::command]
pub async fn nav_group(
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    dir: i32,
) -> Result<Option<Note>> {
    let label = window.label().to_string();
    let current_id = lock(&wn.0)?
        .get(&label)
        .cloned()
        .ok_or(Error::WindowNotMapped)?;
    let notes = {
        let s = lock(&store)?;
        let cur = s.load(&current_id).ok_or(Error::NoteNotFound)?;
        let Some(g) = cur.meta.group.clone() else {
            return Ok(None);
        };
        s.group_notes(&g)
    };
    if notes.len() < 2 {
        return Ok(None);
    }
    let idx = notes
        .iter()
        .position(|n| n.meta.id == current_id)
        .unwrap_or(0) as i32;
    let len = notes.len() as i32;
    let target = notes[(((idx + dir) % len + len) % len) as usize].clone();
    let other = lock(&wn.0)?
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
    lock(&wn.0)?.insert(label, target.meta.id.clone());
    Ok(Some(target))
}

#[tauri::command]
pub fn group_members(store: StoreState, id: String) -> Result<Vec<String>> {
    let s = lock(&store)?;
    let Some(n) = s.load(&id) else {
        return Ok(vec![]);
    };
    let Some(g) = n.meta.group else {
        return Ok(vec![]);
    };
    Ok(s.group_notes(&g).into_iter().map(|n| n.meta.id).collect())
}

/// 그룹 내 특정 노트로 점프 — nav_group과 동일한 "열려 있으면 그 창 포커스" 정책
#[tauri::command]
pub async fn nav_to(
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    id: String,
) -> Result<Option<Note>> {
    let label = window.label().to_string();
    let target = {
        let s = lock(&store)?;
        s.load(&id).ok_or(Error::NoteNotFound)?
    };
    let other = lock(&wn.0)?
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
    lock(&wn.0)?.insert(label, target.meta.id.clone());
    Ok(Some(target))
}

/// 드래그 중 프리뷰: 지금 놓으면 합쳐질 상태(60%+ 겹침)인지 — 프런트가 암전 표시
#[tauri::command]
pub async fn merge_preview(
    app: AppHandle,
    window: tauri::WebviewWindow,
    wn: State<'_, WindowNotes>,
) -> Result<bool> {
    let label = window.label().to_string();
    let Ok(ap) = window.outer_position() else {
        return Ok(false);
    };
    let Ok(asz) = window.outer_size() else {
        return Ok(false);
    };
    let a = (
        ap.x as f64,
        ap.y as f64,
        asz.width as f64,
        asz.height as f64,
    );
    let entries: Vec<String> = lock(&wn.0)?
        .iter()
        .filter(|(l, _)| **l != label)
        .map(|(l, _)| l.clone())
        .collect();
    let mut hint = false;
    for l in entries {
        let Some(w) = app.get_webview_window(&l) else {
            continue;
        };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let (Ok(p), Ok(sz)) = (w.outer_position(), w.outer_size()) else {
            continue;
        };
        if overlap_ratio(
            a,
            (p.x as f64, p.y as f64, sz.width as f64, sz.height as f64),
        ) >= 0.6
        {
            hint = true;
            break;
        }
    }
    let _ = label;
    Ok(hint)
}

/// 드래그 종료 후 호출 — 다른 노트 창과 충분히 겹치면(60%+) 그 노트와 같은
/// 모음집으로 묶고, 끌던 창은 닫는다 (#25 G4)
#[tauri::command]
pub async fn check_merge(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<bool> {
    use tauri::Emitter;
    let label = window.label().to_string();
    let moved_id = lock(&wn.0)?
        .get(&label)
        .cloned()
        .ok_or(Error::WindowNotMapped)?;
    let ap = window.outer_position()?;
    let asz = window.outer_size()?;
    let a = (
        ap.x as f64,
        ap.y as f64,
        asz.width as f64,
        asz.height as f64,
    );
    let entries: Vec<(String, String)> = lock(&wn.0)?
        .iter()
        .filter(|(l, _)| **l != label)
        .map(|(l, id)| (l.clone(), id.clone()))
        .collect();
    let mut best: Option<MergeCandidate> = None;
    for (l, id) in entries {
        let Some(w) = app.get_webview_window(&l) else {
            continue;
        };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let (Ok(p), Ok(sz)) = (w.outer_position(), w.outer_size()) else {
            continue;
        };
        let b = (p.x as f64, p.y as f64, sz.width as f64, sz.height as f64);
        let r = overlap_ratio(a, b);
        if r > best.as_ref().map(|x| x.2).unwrap_or(0.0) {
            best = Some((l, id, r, b));
        }
    }
    let Some((target_label, target_id, ratio, tb)) = best else {
        return Ok(false);
    };
    if ratio < 0.6 || target_id == moved_id {
        return Ok(false);
    }
    // 모음집 창을 얹으면 모음집 전체가 대상 그룹으로 통합된다 (같은 그룹이면 창만 흡수)
    let changed = {
        let s = lock(&store)?;
        s.merge_note_groups(&moved_id, &target_id)?
    };
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

/// 새 창으로 꺼내기 (#74): 현재 메모가 새 창으로 분리되고, 이 창은 그룹의
/// 다음 멤버(창 없는 멤버 우선)로 전환된다 — 반환된 노트를 프런트가 표시.
/// 매핑을 먼저 다음 멤버로 바꾼 뒤 새 창을 만들어, 같은 메모가 두 창에
/// 보이는 순간을 만들지 않는다. 나머지 멤버가 전부 열려 있으면 전환할 곳이
/// 없으므로 다음 멤버 창을 포커스만 하고 None.
#[tauri::command]
pub async fn pop_out(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<Option<Note>> {
    let label = window.label().to_string();
    let current_id = lock(&wn.0)?
        .get(&label)
        .cloned()
        .ok_or(Error::WindowNotMapped)?;
    let (cur, members) = {
        let s = lock(&store)?;
        let cur = s.load(&current_id).ok_or(Error::NoteNotFound)?;
        let Some(g) = cur.meta.group.clone() else {
            return Ok(None);
        };
        let ns = s.group_notes(&g);
        (cur, ns)
    };
    if members.len() < 2 {
        return Ok(None);
    }
    let mapped: std::collections::HashSet<String> = lock(&wn.0)?.values().cloned().collect();
    let Some(next) = pop_out_next(&members, &current_id, &mapped).cloned() else {
        // 전부 창이 있으면 다음 노트의 창으로 포커스
        let idx = members
            .iter()
            .position(|n| n.meta.id == current_id)
            .unwrap_or(0);
        let next_id = members[(idx + 1) % members.len()].meta.id.clone();
        let target_label = lock(&wn.0)?
            .iter()
            .find(|(_, id)| **id == next_id)
            .map(|(l, _)| l.clone());
        if let Some(l) = target_label {
            if let Some(w) = app.get_webview_window(&l) {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        return Ok(None);
    };
    // 1) 이 창을 다음 멤버로 전환 — 매핑을 먼저 바꿔야 아래 open_note_window의
    //    중복 검사가 현재 메모를 "이미 이 창에 있음"으로 오인하지 않는다
    lock(&wn.0)?.insert(label, next.meta.id.clone());
    // 2) 현재 메모를 옆에 어긋난 새 창으로
    let mut popped = cur.clone();
    popped.meta.window.x = cur.meta.window.x + 28.0;
    popped.meta.window.y = cur.meta.window.y + 28.0;
    crate::windows::open_note_window(&app, &popped)?;
    Ok(Some(next))
}

/// 팝아웃 시 기존 창이 전환할 다음 멤버 — 창이 없는 멤버를 순환 탐색,
/// 전부 열려 있으면 None (#74). 순수 함수 — 테스트 대상.
pub fn pop_out_next<'a>(
    members: &'a [Note],
    current_id: &str,
    mapped: &std::collections::HashSet<String>,
) -> Option<&'a Note> {
    let idx = members.iter().position(|n| n.meta.id == current_id)?;
    (1..members.len())
        .map(|k| &members[(idx + k) % members.len()])
        .find(|n| !mapped.contains(&n.meta.id))
}

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    crate::fonts::list_system_fonts()
}

#[tauri::command]
pub fn open_data_dir(store: StoreState) -> Result<()> {
    // 프런트의 opener open_path는 경로 스코프 권한이 따로 필요해 실패한다(#15 QA) —
    // Rust API로 직접 연다
    let root = lock(&store)?.root().to_path_buf();
    tauri_plugin_opener::open_path(root, None::<&str>).map_err(|e| Error::External(e.to_string()))
}

#[tauri::command]
pub fn get_settings(store: StoreState) -> Result<Settings> {
    Ok(lock(&store)?.settings())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, store: StoreState, settings: Settings) -> Result<()> {
    lock(&store)?.set_settings(&settings)?;
    // 다른 창(노트들)이 테마·즐겨찾기 변경을 즉시 반영하도록 알린다
    use tauri::Emitter;
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::NoteMeta;
    use std::collections::HashSet;

    #[test]
    fn overlap_full_partial_none() {
        let a = (0.0, 0.0, 100.0, 100.0);
        assert!((overlap_ratio(a, (0.0, 0.0, 100.0, 100.0)) - 1.0).abs() < 1e-9);
        assert!((overlap_ratio(a, (50.0, 0.0, 100.0, 100.0)) - 0.5).abs() < 1e-9);
        assert_eq!(overlap_ratio(a, (200.0, 200.0, 100.0, 100.0)), 0.0);
    }

    #[test]
    fn overlap_negative_coordinates() {
        // 보조 모니터가 주 모니터 왼쪽/위(음수 좌표)에 배치된 실사용 구성
        let a = (-1000.0, -500.0, 100.0, 100.0);
        assert!((overlap_ratio(a, (-1000.0, -500.0, 100.0, 100.0)) - 1.0).abs() < 1e-9);
        assert!((overlap_ratio(a, (-950.0, -500.0, 100.0, 100.0)) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn overlap_contained_windows() {
        // 작은 창이 큰 창 안에 완전히 들어가면 (이동한 창 면적 기준) 100%
        let small = (10.0, 10.0, 50.0, 50.0);
        let big = (0.0, 0.0, 200.0, 200.0);
        assert!((overlap_ratio(small, big) - 1.0).abs() < 1e-9);
        // 큰 창을 작은 창 위에 놓으면 작은 창 면적 / 큰 창 면적
        assert!((overlap_ratio(big, small) - (50.0 * 50.0) / (200.0 * 200.0)).abs() < 1e-9);
    }

    #[test]
    fn overlap_touching_edges_is_zero() {
        let a = (0.0, 0.0, 100.0, 100.0);
        assert_eq!(overlap_ratio(a, (100.0, 0.0, 100.0, 100.0)), 0.0);
        assert_eq!(overlap_ratio(a, (0.0, 100.0, 100.0, 100.0)), 0.0);
    }

    #[test]
    fn overlap_zero_size_is_zero_not_nan() {
        let a = (0.0, 0.0, 0.0, 0.0);
        let b = (0.0, 0.0, 100.0, 100.0);
        assert_eq!(overlap_ratio(a, b), 0.0);
        assert_eq!(overlap_ratio(b, a), 0.0);
    }

    fn note(id: &str) -> Note {
        Note {
            meta: NoteMeta::new_default(id.into()),
            body: String::new(),
        }
    }
    fn set(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn prefers_next_member_without_window() {
        let m = [note("a"), note("b"), note("c")];
        assert_eq!(pop_out_next(&m, "a", &set(&["a"])).unwrap().meta.id, "b");
    }

    #[test]
    fn skips_members_that_already_have_windows() {
        let m = [note("a"), note("b"), note("c")];
        assert_eq!(
            pop_out_next(&m, "a", &set(&["a", "b"])).unwrap().meta.id,
            "c"
        );
    }

    #[test]
    fn wraps_around_the_group() {
        let m = [note("a"), note("b"), note("c")];
        assert_eq!(
            pop_out_next(&m, "c", &set(&["c", "b"])).unwrap().meta.id,
            "a"
        );
    }

    #[test]
    fn none_when_all_other_members_open() {
        let m = [note("a"), note("b")];
        assert!(pop_out_next(&m, "a", &set(&["a", "b"])).is_none());
    }

    #[test]
    fn none_when_current_not_in_members() {
        let m = [note("a"), note("b")];
        assert!(pop_out_next(&m, "x", &set(&[])).is_none());
    }
}
