use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::store::{MetaPatch, Note, Settings, Store};
use crate::windows;
use crate::{Error, Result};

type StoreState<'a> = State<'a, Mutex<Store>>;

/// 마지막으로 본(포커스한) 노트 id — Alt-Tab 썸네일 미리보기용 (세션 한정)
pub struct LastViewed(pub Mutex<Option<String>>);

/// 식별자 폴더(%APPDATA%/com.ddakji.app) — storage-path.txt 포인터 저장 위치
pub struct IdDir(pub std::path::PathBuf);

/// 창 label → 표시 중인 노트 id (#25 그룹 넘기기로 창-노트가 동적이 됨)
pub struct WindowNotes(pub Mutex<std::collections::HashMap<String, String>>);

/// 합치기를 되돌리는 데 필요한 이전 상태 (#115)
pub struct MergeUndo {
    /// (노트 id, 합치기 이전 모음집) — 대상과 끌던 쪽 멤버 전부
    pub previous: Vec<(String, Option<String>)>,
    /// 흡수되어 닫힌 창의 노트
    pub moved_id: String,
    /// 그 창이 있던 자리 (논리 픽셀)
    pub moved_window: crate::store::WindowBounds,
}

/// 직전 합치기 한 칸만 기억한다 — 세션 한정, "방금 그거"를 무르는 용도.
pub struct LastMerge(pub Mutex<Option<MergeUndo>>);

/// 드래그 중 마지막으로 본 커서 위치 = 놓은 지점 (#115).
///
/// 판정은 창이 멎고 500ms 뒤에 도는데, 그때 커서를 읽으면 이미 사용자가
/// 마우스를 다른 데로 옮긴 뒤일 수 있다. **버튼이 눌린 동안** 본 좌표만
/// 드롭 지점으로 인정한다.
pub struct DragCursor(pub Mutex<Option<(f64, f64)>>);

/// 병합 예고가 켜진 대상 창 (#171). 대상이 바뀌거나 판정이 끝나면
/// `merge-disarm`을 보내고 들썩임을 멈춘다 — 예고를 켠 쪽이 끌 책임을 진다.
/// `gen`은 상태가 바뀔 때마다 증가한다: 들썩임 스레드는 자기 세대가 지나면
/// 스스로 멈추고 창을 제자리로 되돌린다.
#[derive(Default)]
pub struct ArmState {
    pub label: Option<String>,
    pub gen: u64,
}
pub struct ArmedTarget(pub Mutex<ArmState>);

/// 상태 잠금 — 다른 스레드가 패닉했을 때만 실패한다.
/// 창이 이 노트를 표시하게 됐다 — 매핑을 갱신하고, 모음집이면 "마지막으로
/// 보던 장" 커서를 지속한다. **매핑 갱신은 반드시 이 함수로**: insert가
/// 흩어져 있던 시절, 커서 같은 부수 규칙을 어느 한 곳이 빼먹는 사고가
/// 구조적으로 가능했다.
pub fn window_shows(
    store: &Mutex<Store>,
    wn: &WindowNotes,
    label: String,
    note: &Note,
) -> Result<()> {
    lock(&wn.0)?.insert(label, note.meta.id.clone());
    if let Some(g) = note.meta.group.as_deref() {
        // 커서 기록 실패는 치명적이지 않다 — 다음 전환에서 다시 쓴다
        if let Ok(mut s) = lock(store) {
            let _ = s.set_group_cursor(g, &note.meta.id);
        }
    }
    Ok(())
}

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
    use tauri::Emitter;
    // 이 노트를 보여 주던 창과, 그 창이 넘겨받을 다음 멤버를 **삭제 전에** 정한다.
    // 지우고 나면 이 노트가 어느 모음집이었는지 알 수 없다.
    let (label, mapped) = {
        let m = lock(&wn.0)?;
        let label = m
            .iter()
            .find(|(_, nid)| **nid == id)
            .map(|(l, _)| l.clone());
        (
            label,
            m.values()
                .cloned()
                .collect::<std::collections::HashSet<_>>(),
        )
    };
    let next_id = if label.is_some() {
        let s = lock(&store)?;
        match s.load(&id).and_then(|n| n.meta.group) {
            Some(g) => pop_out_next(&visible_members(s.group_notes(&g)), &id, &mapped)
                .map(|n| n.meta.id.clone()),
            None => None,
        }
    } else {
        None
    };

    lock(&store)?.delete(&id)?;

    if let Some(l) = label {
        // 삭제 뒤 상태를 다시 읽는다 — 혼자 남은 모음집은 해제되어(룰3) 메타가 바뀐다
        let next = next_id.and_then(|nid| lock(&store).ok().and_then(|s| s.load(&nid)));
        match next {
            // 모음집 하나 = 창 하나(룰4)다. 한 장을 지웠다고 창을 없애면 모음집
            // 전체가 화면에서 사라지므로, 창은 다음 장에게 넘긴다 (pop_out과 같은 규약).
            Some(next) => {
                window_shows(&store, &wn, l.clone(), &next)?;
                if let Some(win) = app.get_webview_window(&l) {
                    let _ = win.emit_to(&l, "switch-note", &next);
                }
            }
            // 넘길 장이 없으면(단독 노트) 창까지 정리한다
            None => {
                if let Some(win) = app.get_webview_window(&l) {
                    win.destroy()?;
                }
            }
        }
    }
    // 모음집 멤버였다면 남은 창들의 멤버 목록·점이 갱신되도록 (자동 해제 포함)
    let _ = app.emit("groups-changed", ());
    Ok(())
}

/// 휴지통 목록 — 최근에 지운 것부터.
#[tauri::command]
pub fn list_trash(store: StoreState) -> Result<Vec<crate::store::TrashedNote>> {
    Ok(lock(&store)?.list_trash())
}

/// 휴지통에서 되살린다. 창을 새로 열지는 않는다 — 목록에 돌아오고, 여느
/// 노트처럼 목록에서 열면 된다.
#[tauri::command]
pub async fn restore_note(app: AppHandle, store: StoreState<'_>, id: String) -> Result<Note> {
    use tauri::Emitter;
    let note = lock(&store)?.restore(&id)?;
    // 되살아난 노트가 모음집 멤버일 수 있다 — 열린 창들의 멤버 목록·점 갱신
    let _ = app.emit("groups-changed", ());
    Ok(note)
}

/// 영구 삭제 — 되돌릴 수 없는 유일한 지점.
#[tauri::command]
pub fn purge_note(store: StoreState, id: String) -> Result<()> {
    lock(&store)?.purge(&id)
}

/// 휴지통 비우기 — 지운 개수를 돌려준다.
#[tauri::command]
pub fn empty_trash(store: StoreState) -> Result<usize> {
    lock(&store)?.empty_trash()
}

#[tauri::command]
pub async fn open_note(
    app: AppHandle,
    _store: StoreState<'_>,
    _wn: State<'_, WindowNotes>,
    id: String,
) -> Result<()> {
    open_note_by_id(&app, &id)
}

/// 노트 창 열기/포커스 — 모음집 멤버는 모음집 창을 전환한다(#77 룰4).
/// 목록의 커맨드와 CLI `--open`(single-instance argv, #12) 경로가 공유한다.
pub fn open_note_by_id(app: &AppHandle, id: &str) -> Result<()> {
    use tauri::Emitter;
    let store = app.state::<Mutex<Store>>();
    let wn = app.state::<WindowNotes>();
    let note = {
        let s = lock(&store)?;
        s.save_meta(
            id,
            &MetaPatch {
                hidden: Some(false),
                ..Default::default()
            },
        )?
    };
    // 모음집 멤버는 새 창을 만들지 않는다 — 모음집 창이 그 멤버로 전환된다
    // (#77 룰4). 단, 이 노트 자체가 이미 창에 있으면 그 창을 포커스(기존 동작).
    if let Some(g) = note.meta.group.clone() {
        let member_ids: std::collections::HashSet<String> = {
            let s = lock(&store)?;
            s.group_notes(&g).into_iter().map(|n| n.meta.id).collect()
        };
        let group_win = lock(&wn.0)?
            .iter()
            .find(|(_, nid)| nid.as_str() != id && member_ids.contains(*nid))
            .map(|(l, _)| l.clone());
        let self_open = lock(&wn.0)?.values().any(|nid| nid == id);
        if !self_open {
            if let Some(label) = group_win {
                if let Some(w) = app.get_webview_window(&label) {
                    window_shows(&store, &wn, label.clone(), &note)?;
                    let _ = w.emit_to(label, "switch-note", &note);
                    let _ = w.show();
                    let _ = w.set_focus();
                    return Ok(());
                }
            }
        }
    }
    Ok(windows::open_note_window(app, &note)?)
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

/// 실행 형태 (#141) — 업데이터는 설치본(NSIS) 전용이다. 포터블에서 설치를
/// 돌리면 사용자가 고른 배포 형태를 바꿔 버리므로, 프런트가 이 값을 보고
/// 포터블에는 릴리스 페이지 링크만 보여 준다.
#[tauri::command]
pub fn exe_kind() -> &'static str {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(exe_kind_of))
        .unwrap_or("portable")
}

/// NSIS 설치 위치 판별. per-user 기본은 `%LOCALAPPDATA%\ddakji`,
/// per-machine은 `Program Files\ddakji` — 처음엔 존재하지 않는
/// `Programs\ddakji`를 보고 있어 설치본이 포터블로 오판됐다(#153 QA).
fn exe_kind_of(path: &str) -> &'static str {
    let p = path.to_lowercase();
    let installed =
        p.contains("\\appdata\\local\\ddakji\\") || p.contains("\\program files\\ddakji\\");
    if installed {
        "installed"
    } else {
        "portable"
    }
}

/// AI 연동 (#161) — 설정 화면의 입구. 전제: 사용자는 README를 읽지 않는다.
#[tauri::command]
pub fn install_ai_skill() -> Result<String> {
    let root = crate::skill::default_skills_root()
        .ok_or_else(|| Error::Invalid("home directory not found".into()))?;
    Ok(crate::skill::install_skill_to(&root)?.display().to_string())
}

/// 자기 옆의 ddakji-mcp 경로를 채운 MCP 등록 JSON (#161)
#[tauri::command]
pub fn mcp_config() -> Result<String> {
    let exe = std::env::current_exe().map_err(Error::Io)?;
    let mcp = exe
        .parent()
        .map(|d| {
            d.join(if cfg!(windows) {
                "ddakji-mcp.exe"
            } else {
                "ddakji-mcp"
            })
        })
        .filter(|p| p.exists())
        .ok_or_else(|| Error::Invalid("ddakji-mcp not found next to the app".into()))?;
    Ok(crate::skill::mcp_client_config(&mcp))
}

/// 앱 폴더(=CLI가 있는 곳)를 탐색기로 (#161) — CLI 존재의 발견
#[tauri::command]
pub fn open_app_dir() -> Result<()> {
    let dir = std::env::current_exe()
        .map_err(Error::Io)?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| Error::Invalid("no parent dir".into()))?;
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| Error::External(e.to_string()))
}

/// 노트 내보내기 (#149) — dest는 저장 다이얼로그가 준 경로(확장자는 내용에
/// 따라 .md/.zip으로 바뀔 수 있어 실제 경로를 돌려준다)
#[tauri::command]
pub fn export_note_md(store: StoreState, id: String, dest: String) -> Result<String> {
    crate::export::export_md(&*lock(&store)?, &id, std::path::Path::new(&dest))
}

/// 이미지 → data URI (#149) — 프런트가 내보내기 HTML·클립보드에 내장한다
#[tauri::command]
pub fn asset_data_uri(store: StoreState, id: String, rel: String) -> Result<String> {
    crate::export::asset_data_uri(&*lock(&store)?, &id, &rel)
}

/// 텍스트 파일 저장 (#149) — 내보내기 HTML 등, 경로는 저장 다이얼로그 출신
#[tauri::command]
pub fn write_text_file(dest: String, content: String) -> Result<()> {
    std::fs::write(dest, content)?;
    Ok(())
}

/// 모음집 이름 바꾸기 (#139) — 목록의 그룹 헤더 인라인 편집이 부른다
#[tauri::command]
pub async fn rename_group(
    app: AppHandle,
    store: StoreState<'_>,
    old: String,
    new: String,
) -> Result<usize> {
    use tauri::Emitter;
    let n = lock(&store)?.rename_group(&old, &new)?;
    if n > 0 {
        let _ = app.emit("groups-changed", ());
    }
    Ok(n)
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

/// 커서가 놓인 지점이 어느 창 위인지 — 합치기의 유일한 기준 (#115).
///
/// 겹침 면적으로 재던 이전 방식은 "얼마나 덮였나"를 물었지만, 사용자는 창을
/// **겨냥해서** 놓는다. 지점 기준이면 겨냥한 곳이 곧 대상이라 예측 가능하고,
/// 옆에 나란히 두려다 우연히 합쳐지는 일도 없다.
///
/// 후보가 여럿 겹치면 **더 작은 창**을 고른다 — 큰 창 위에 작은 창이 얹힌
/// 배치에서 사용자가 겨냥한 쪽은 위에 있는 작은 창이다.
///
/// `candidates`에는 끌고 있는 창을 넣지 않는다 (커서는 늘 그 창 위에 있다).
pub fn drop_target<T>(cursor: (f64, f64), candidates: &[(T, Rect)]) -> Option<&T> {
    let (cx, cy) = cursor;
    candidates
        .iter()
        .filter(|(_, (x, y, w, h))| cx >= *x && cx < x + w && cy >= *y && cy < y + h)
        .min_by(|(_, a), (_, b)| {
            (a.2 * a.3)
                .partial_cmp(&(b.2 * b.3))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(t, _)| t)
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
        visible_members(s.group_notes(&g))
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
    window_shows(&store, &wn, label, &target)?;
    Ok(Some(target))
}

/// 넘기기·점이 도는 멤버 = 숨기지 않은 멤버. 숨긴 장은 화면 세션에서 빠진
/// 것이므로 화살표로도 점으로도 닿지 않는다 — 목록에서 열면 다시 합류한다
/// (`open_note_by_id`가 hidden=false로 되돌린다).
///
/// Store::group_notes는 그대로 둔다: 모음집 해제 판정(룰3)·순서 재배치는
/// 숨김과 무관하게 실제 멤버 전부를 봐야 한다.
fn visible_members(members: Vec<Note>) -> Vec<Note> {
    members.into_iter().filter(|n| !n.meta.hidden).collect()
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
    Ok(visible_members(s.group_notes(&g))
        .into_iter()
        .map(|n| n.meta.id)
        .collect())
}

/// 이 창이 보여 주는 노트 **하나만** 숨긴다 (Ctrl+W).
/// 모음집이면 창은 남고 다음 멤버로 전환된다 — 브라우저의 탭 닫기와 같은 관계.
/// 전환할 멤버가 없으면(단독 노트이거나 나머지가 전부 다른 창에 있음) None을
/// 돌려주고, 창을 닫는 일은 프런트가 한다(기존 CloseRequested 경로 재사용).
#[tauri::command]
pub async fn hide_note(
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<Option<Note>> {
    let label = window.label().to_string();
    let current_id = lock(&wn.0)?
        .get(&label)
        .cloned()
        .ok_or(Error::WindowNotMapped)?;
    let members = {
        let s = lock(&store)?;
        let cur = s.load(&current_id).ok_or(Error::NoteNotFound)?;
        match cur.meta.group.clone() {
            Some(g) => visible_members(s.group_notes(&g)),
            None => vec![],
        }
    };
    let mapped: std::collections::HashSet<String> = lock(&wn.0)?.values().cloned().collect();
    let next = pop_out_next(&members, &current_id, &mapped).map(|n| n.meta.id.clone());
    let next = {
        let s = lock(&store)?;
        s.save_meta(
            &current_id,
            &MetaPatch {
                hidden: Some(true),
                ..Default::default()
            },
        )?;
        next.and_then(|id| s.load(&id))
    };
    let Some(next) = next else {
        return Ok(None);
    };
    window_shows(&store, &wn, label, &next)?;
    Ok(Some(next))
}

/// 이 창이 든 모음집을 통째로 숨긴다 (Ctrl+Shift+W, 툴바 X).
/// 멤버 전부에 hidden을 세우고, 창을 닫는 일은 프런트가 한다.
/// 모음집이 아니면 이 노트 하나만 — 결과는 기존 닫기와 같다.
#[tauri::command]
pub async fn hide_group(
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<()> {
    let label = window.label().to_string();
    let current_id = lock(&wn.0)?
        .get(&label)
        .cloned()
        .ok_or(Error::WindowNotMapped)?;
    let s = lock(&store)?;
    let cur = s.load(&current_id).ok_or(Error::NoteNotFound)?;
    let ids: Vec<String> = match cur.meta.group.clone() {
        Some(g) => visible_members(s.group_notes(&g))
            .into_iter()
            .map(|n| n.meta.id)
            .collect(),
        None => vec![current_id],
    };
    for id in ids {
        s.save_meta(
            &id,
            &MetaPatch {
                hidden: Some(true),
                ..Default::default()
            },
        )?;
    }
    Ok(())
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
    window_shows(&store, &wn, label, &target)?;
    Ok(Some(target))
}

/// 예고 중 끌던 창의 불투명도 (자석 효과) — 아래 깔린 대상이 비쳐 보인다
const DRAG_ALPHA: u8 = 140;

/// 드래그 중 프리뷰 (#171): 지금 놓으면 합쳐질 대상 노트의 표시 이름.
///
/// 판정 기준은 check_merge와 동일(커서가 대상 **타이틀바 띠** 위) — 예고와
/// 실제 판정이 어긋나면 예고가 거짓말이 된다. 대상이 있으면 끌던 창을
/// 반투명(자석)으로 만들고 대상 창에 `merge-arm`(들썩임)을 보낸다.
#[tauri::command]
pub async fn merge_preview(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    drag: State<'_, DragCursor>,
    armed: State<'_, ArmedTarget>,
) -> Result<Option<String>> {
    let label = window.label().to_string();
    let button_down = crate::pointer::primary_button_down();
    let cursor = crate::pointer::cursor_pos();
    // 버튼이 확실히 올라가 있으면 예고하지 않는다 — 자동 정렬·흡수 애니메이션
    // 같은 프로그램 이동에서 오발동하지 않는다. 버튼 상태를 알 수 없는
    // 플랫폼(None)은 드래그로 간주한다(기존 동작 유지).
    if button_down == Some(false) || cursor.is_none() {
        crate::window_fx::set_alpha(&window, 255);
        set_armed(&app, &armed, None)?;
        return Ok(None);
    }
    let cursor = cursor.expect("checked above");
    // 드래그로 움직이는 중에만 드롭 지점 후보로 기억한다. 버튼을 누르지 않은
    // 이동(프로그램에 의한 배치 등)은 합치기 대상이 아니다.
    if button_down == Some(true) {
        *lock(&drag.0)? = Some(cursor);
    }
    let bars: Vec<((String, String), Rect)> = other_note_rects(&app, &wn, &label)?
        .iter()
        .map(|(owner, r, f)| (owner.clone(), bar_rect(*r, *f)))
        .collect();
    match drop_target(cursor, &bars).cloned() {
        Some((target_label, target_id)) => {
            crate::window_fx::set_alpha(&window, DRAG_ALPHA);
            set_armed(&app, &armed, Some(target_label))?;
            let title = lock(&store)?
                .load(&target_id)
                .map(|n| display_title(&n))
                .unwrap_or_default();
            Ok(Some(title))
        }
        None => {
            crate::window_fx::set_alpha(&window, 255);
            set_armed(&app, &armed, None)?;
            Ok(None)
        }
    }
}

/// 자동 정렬 (#170) — 모든 노트 창을 크기 그대로 작업 영역 안에 재배치
#[tauri::command]
pub async fn arrange_windows(app: AppHandle) -> Result<()> {
    crate::arrange::run(&app);
    Ok(())
}

/// (창 label, 노트 id), 물리 px 사각형, 창 배율
type NoteRect = ((String, String), Rect, f64);

/// 끌고 있는 창을 뺀, 화면에 떠 있는 노트 창들의 (label, id, 사각형, 배율).
/// 커서는 늘 끌고 있는 창 위에 있으므로 그 창은 후보에서 제외한다.
fn other_note_rects(
    app: &AppHandle,
    wn: &State<'_, WindowNotes>,
    label: &str,
) -> Result<Vec<NoteRect>> {
    let entries: Vec<(String, String)> = lock(&wn.0)?
        .iter()
        .filter(|(l, _)| l.as_str() != label)
        .map(|(l, id)| (l.clone(), id.clone()))
        .collect();
    let mut out = Vec::new();
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
        out.push((
            (l, id),
            (p.x as f64, p.y as f64, sz.width as f64, sz.height as f64),
            w.scale_factor().unwrap_or(1.0),
        ));
    }
    Ok(out)
}

/// 병합 드롭 존 = 창 상단의 타이틀바 띠 (#171).
///
/// 창 전체를 드롭 존으로 삼던 방식은 노트가 클수록 우연히 맞을 확률이 커져
/// "옮기려던 드롭"이 병합으로 끝나곤 했다. 커서 한 점 대 40px 띠로 좁히면
/// 창 크기와 무관하게 병합은 조준해야만 일어난다.
fn bar_rect((x, y, w, _h): Rect, factor: f64) -> Rect {
    (x, y, w, windows::TITLE_BAR_HEIGHT * factor)
}

/// 예고 표시용 노트 이름 — 제목이 없으면 본문 첫 줄 (CLI 목록과 같은 규칙)
fn display_title(n: &Note) -> String {
    n.meta
        .title
        .clone()
        .or_else(|| {
            n.body
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty())
                .map(String::from)
        })
        .unwrap_or_default()
}

/// 까딱임(#171) — 겨냥당하는 순간 창이 한 번 흔들리고 멈춘다.
/// 연속 진동은 OS 창 이동이 서브픽셀이 안 돼 기계적 떨림으로 보였다(QA).
/// 감쇠 사인 2사이클: 또렷하게 "반응했다"가 전달되고 바로 잠잠해진다.
const NOD_AMPLITUDE_PX: f64 = 3.0;
const NOD_DURATION_MS: f64 = 360.0;
const NOD_CYCLES: f64 = 2.0;
const NOD_TICK: std::time::Duration = std::time::Duration::from_millis(15);

/// 예고 상태 전환 — 새 대상에 `merge-arm`(하트비트) + 까딱임 한 번,
/// 이전 대상에 `merge-disarm`. 대상이 그대로면 arm 하트비트만 다시 보낸다
/// (프런트가 1초 무소식이면 스스로 걷는다).
fn set_armed(app: &AppHandle, armed: &State<'_, ArmedTarget>, next: Option<String>) -> Result<()> {
    use tauri::Emitter;
    let spawn = {
        let mut s = lock(&armed.0)?;
        if s.label == next {
            None
        } else {
            s.gen += 1;
            if let Some(prev) = s.label.as_deref() {
                let _ = app.emit_to(prev, "merge-disarm", ());
            }
            s.label = next.clone();
            next.clone().map(|l| (l, s.gen))
        }
    };
    if let Some(l) = next.as_deref() {
        let _ = app.emit_to(l, "merge-arm", ());
    }
    if let Some((label, gen)) = spawn {
        spawn_nod(app.clone(), label, gen);
    }
    Ok(())
}

/// 겨냥당한 창을 한 번 까딱인다 — 데모의 "들썩"을 창 이동으로 번역하되,
/// 연속이 아니라 일회성 감쇠 진동으로. (내용만 흔들면 글자만 팔랑이고,
/// 계속 흔들면 기계적 떨림으로 보인다 — 두 번의 QA 피드백.)
///
/// 프런트는 merge-arm을 받는 동안 자기 onMoved를 드래그로 치지 않으므로,
/// 이 움직임이 병합 판정·위치 저장을 오염시키지 않는다. 세대(`gen`)가
/// 바뀌면 즉시 멈추고, 끝나면 정확히 제자리로 되돌린다.
fn spawn_nod(app: AppHandle, label: String, gen: u64) {
    std::thread::spawn(move || {
        let Some(win) = app.get_webview_window(&label) else {
            return;
        };
        let Ok(orig) = win.outer_position() else {
            return;
        };
        let amp = NOD_AMPLITUDE_PX * win.scale_factor().unwrap_or(1.0);
        let started = std::time::Instant::now();
        loop {
            let live = app
                .try_state::<ArmedTarget>()
                .and_then(|a| a.0.lock().ok().map(|s| s.gen == gen))
                .unwrap_or(false);
            let t = started.elapsed().as_millis() as f64;
            if !live || t >= NOD_DURATION_MS {
                break;
            }
            // 감쇠 사인 — 크게 시작해 잦아든다
            let phase = t / NOD_DURATION_MS;
            let dx = (phase * NOD_CYCLES * std::f64::consts::TAU).sin() * amp * (1.0 - phase);
            let _ = win.set_position(tauri::PhysicalPosition::new(
                orig.x + dx.round() as i32,
                orig.y,
            ));
            std::thread::sleep(NOD_TICK);
        }
        let _ = win.set_position(orig);
    });
}

/// 다른 노트의 **타이틀바 위에 놓였으면** 그 노트와 같은 모음집으로 묶고,
/// 끌던 창은 닫는다 (#25 G4, 드롭 존은 #171에서 타이틀바 띠로 축소).
///
/// 프런트는 움직임이 멎으면 이 커맨드를 부르지만, 멎은 것과 놓은 것은 다르다
/// (#115). 여기서 마우스 버튼이 떨어질 때까지 기다린 **뒤에** 위치를 잰다 —
/// 기다리는 동안 창이 더 움직였을 수 있으므로 판정은 놓인 자리로 해야 한다.
#[tauri::command]
pub async fn check_merge(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
    last: State<'_, LastMerge>,
    drag: State<'_, DragCursor>,
    armed: State<'_, ArmedTarget>,
) -> Result<bool> {
    use tauri::Emitter;
    // 놓을 때까지 기다리고, **버튼이 눌린 동안** 본 좌표를 드롭 지점으로 삼는다.
    // 놓은 뒤에 읽으면 그사이 마우스를 옮긴 자리로 오판한다 (#115).
    let sampled = crate::pointer::wait_for_drop();
    // 놓였으니 예고를 걷는다 — 합쳐지면 곧 흡수 애니메이션이, 아니면 아무 일도
    // 없다. 어느 쪽이든 반투명·들썩임이 남아 있으면 안 된다.
    crate::window_fx::set_alpha(&window, 255);
    set_armed(&app, &armed, None)?;
    let remembered = lock(&drag.0)?.take();
    let dropped_at = match sampled {
        Err(()) => return Ok(false), // 20초 넘게 누르고 있음 — 판정 포기
        Ok(Some(p)) => Some(p),
        // 이 호출이 시작될 땐 이미 놓인 뒤였다 — 드래그 중에 봐 둔 자리를 쓴다
        Ok(None) => remembered,
    };
    let Some(cursor) = dropped_at else {
        return Ok(false);
    };
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
    // 놓인 지점이 어느 창의 **타이틀바** 위인지로 정한다 — 겨냥한 곳이 곧
    // 대상 (#115), 드롭 존은 상단 40px 띠 (#171). `cursor`는 위에서 구한
    // **놓은 순간**의 좌표다.
    let candidates = other_note_rects(&app, &wn, &label)?;
    let bars: Vec<((String, String), Rect)> = candidates
        .iter()
        .map(|(owner, r, f)| (owner.clone(), bar_rect(*r, *f)))
        .collect();
    let Some((target_label, target_id)) = drop_target(cursor, &bars).cloned() else {
        return Ok(false);
    };
    if target_id == moved_id {
        return Ok(false);
    }
    // 흡수 애니메이션의 목적지는 창 전체 중심 — 판정만 타이틀바로 좁혔다
    let tb = candidates
        .iter()
        .find(|((l, _), _, _)| *l == target_label)
        .map(|(_, r, _)| *r)
        .unwrap_or(a);
    // 되돌리기용 이전 상태 — 합치기 **전에** 찍어 둔다 (#115)
    let previous = {
        let s = lock(&store)?;
        let mut v: Vec<(String, Option<String>)> = Vec::new();
        if let Some(t) = s.load(&target_id) {
            v.push((target_id.clone(), t.meta.group.clone()));
        }
        match s.load(&moved_id).and_then(|m| m.meta.group) {
            // 모음집째 얹혔다면 그 멤버 전부가 대상 그룹으로 이적한다
            Some(old) => v.extend(
                s.group_notes(&old)
                    .into_iter()
                    .map(|n| (n.meta.id, n.meta.group)),
            ),
            None => v.push((moved_id.clone(), None)),
        }
        v
    };
    // 창이 있던 자리 — 되돌릴 때 이 자리로 다시 연다. 드롭을 기다리는 동안
    // 움직였을 수 있으므로 저장된 메타가 아니라 지금 실제 위치를 쓴다.
    let factor = window.scale_factor().unwrap_or(1.0);
    let moved_window = crate::store::WindowBounds {
        x: a.0 / factor,
        y: a.1 / factor,
        w: a.2 / factor,
        h: a.3 / factor,
    };
    // 모음집 창을 얹으면 모음집 전체가 대상 그룹으로 통합된다 (같은 그룹이면 창만 흡수)
    let changed = {
        let s = lock(&store)?;
        s.merge_note_groups(&moved_id, &target_id)?
    };
    if let Ok(mut slot) = last.0.lock() {
        *slot = Some(MergeUndo {
            previous,
            moved_id: moved_id.clone(),
            moved_window,
        });
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
        // 흡수한 창이 "합쳤습니다 · 되돌리기"를 띄운다 (#115) — 판정이 한 번
        // 틀려도 손해가 없어야 한다
        let _ = w.emit_to(&target_label, "merged-in", ());
    }
    if changed {
        let _ = app.emit("groups-changed", ());
    }
    let _ = window.destroy();
    Ok(true)
}

/// 직전 합치기 되돌리기 (#115) — 이전 모음집을 복구하고, 흡수되며 닫힌 창을
/// 있던 자리에 다시 연다. 한 칸만 기억하므로 "방금 그거"에만 쓴다.
#[tauri::command]
pub async fn undo_merge(
    app: AppHandle,
    store: StoreState<'_>,
    last: State<'_, LastMerge>,
) -> Result<bool> {
    use tauri::Emitter;
    let Some(u) = lock(&last.0)?.take() else {
        return Ok(false);
    };
    let note = {
        let s = lock(&store)?;
        // 모음집 복구. 대상이 원래 무소속이었다면 멤버가 하나만 남으므로
        // Store가 알아서 해제한다(룰3) — 여기서 따로 지울 필요가 없다.
        for (id, group) in &u.previous {
            let _ = s.save_meta(
                id,
                &MetaPatch {
                    group: Some(group.clone().unwrap_or_default()),
                    ..Default::default()
                },
            );
        }
        s.save_meta(
            &u.moved_id,
            &MetaPatch {
                window: Some(u.moved_window),
                hidden: Some(false),
                ..Default::default()
            },
        )?
    };
    windows::open_note_window(&app, &note)?;
    let _ = app.emit("groups-changed", ());
    Ok(true)
}

/// 모음집에서 꺼내기 (#77): 현재 노트를 **모음집에서 제외**해 단독 새 창으로
/// 분리하고, 이 창은 다음 멤버로 전환된다 — 반환된 노트를 프런트가 표시.
/// 꺼낸 창은 무소속이므로 넘기기 UI가 사라진다 — "모음집 하나 = 창 하나,
/// 넘기기는 그 창에서만"의 불변식. 남은 멤버가 1명이면 모음집도 해제된다(룰3).
#[tauri::command]
pub async fn pop_out(
    app: AppHandle,
    window: tauri::WebviewWindow,
    store: StoreState<'_>,
    wn: State<'_, WindowNotes>,
) -> Result<Option<Note>> {
    use tauri::Emitter;
    let label = window.label().to_string();
    let current_id = lock(&wn.0)?
        .get(&label)
        .cloned()
        .ok_or(Error::WindowNotMapped)?;
    let members = {
        let s = lock(&store)?;
        let cur = s.load(&current_id).ok_or(Error::NoteNotFound)?;
        let Some(g) = cur.meta.group.clone() else {
            return Ok(None);
        };
        s.group_notes(&g)
    };
    if members.len() < 2 {
        return Ok(None);
    }
    let mapped: std::collections::HashSet<String> = lock(&wn.0)?.values().cloned().collect();
    // 멤버 수는 실제 멤버십으로 세되(위 guard), 이 창이 넘어갈 대상은 숨긴 장을 뺀다
    let visible: Vec<Note> = members.iter().filter(|n| !n.meta.hidden).cloned().collect();
    let next = pop_out_next(&visible, &current_id, &mapped).map(|n| n.meta.id.clone());
    // 1) 현재 노트를 모음집에서 제외 — 혼자 남는 모음집은 Store가 자동 해제(룰3).
    //    꺼낸 뒤 상태는 다시 읽는다 (해제 여부가 메타에 반영되도록).
    let (popped, next) = {
        let s = lock(&store)?;
        s.save_meta(
            &current_id,
            &MetaPatch {
                group: Some(String::new()),
                ..Default::default()
            },
        )?;
        let popped = s.load(&current_id).ok_or(Error::NoteNotFound)?;
        let next = next.and_then(|id| s.load(&id));
        (popped, next)
    };
    let _ = app.emit("groups-changed", ());
    let Some(next) = next else {
        // (비정상 상태 방어) 전환할 멤버가 없으면 이 창이 그대로 단독 창이 된다
        return Ok(None);
    };
    // 2) 이 창을 다음 멤버로 전환 — 매핑을 먼저 바꿔야 아래 open_note_window의
    //    중복 검사가 꺼낸 노트를 "이미 이 창에 있음"으로 오인하지 않는다
    window_shows(&store, &wn, label, &next)?;
    // 3) 꺼낸 노트를 옆에 어긋난 단독 창으로
    let mut popped_win = popped.clone();
    popped_win.meta.window.x = popped.meta.window.x + 28.0;
    popped_win.meta.window.y = popped.meta.window.y + 28.0;
    crate::windows::open_note_window(&app, &popped_win)?;
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

/// 노트 파일을 선택한 채 탐색기를 연다 (#98) — open_data_dir처럼 Rust 직접 호출
#[tauri::command]
pub fn reveal_note(store: StoreState, id: String) -> Result<()> {
    let path = lock(&store)?.note_file(&id)?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| Error::External(e.to_string()))
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
    let lang_changed = {
        let mut s = lock(&store)?;
        let changed = s.settings().language != settings.language;
        s.set_settings(&settings)?;
        changed
    };
    // 다른 창(노트들)이 테마·즐겨찾기·언어 변경을 즉시 반영하도록 알린다
    use tauri::Emitter;
    let _ = app.emit("settings-changed", ());
    if lang_changed {
        crate::tray::rebuild_menu(&app); // 트레이는 Rust가 그린다 (#143)
    }
    Ok(())
}

#[cfg(test)]
mod exe_kind_tests {
    use super::exe_kind_of;

    #[test]
    fn installer_locations_are_installed_everything_else_portable() {
        // per-user NSIS 기본 경로 — 실측 (#153)
        assert_eq!(
            exe_kind_of("C:\\Users\\gnt\\AppData\\Local\\ddakji\\ddakji.exe"),
            "installed"
        );
        assert_eq!(
            exe_kind_of("C:\\Program Files\\ddakji\\ddakji.exe"),
            "installed"
        );
        // 개발 빌드·포터블
        assert_eq!(
            exe_kind_of("C:\\Users\\gnt\\projects\\ddakji\\src-tauri\\target\\release\\ddakji.exe"),
            "portable"
        );
        assert_eq!(exe_kind_of("D:\\tools\\ddakji\\ddakji.exe"), "portable");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::NoteMeta;
    use std::collections::HashSet;

    // 합치기 대상은 **커서가 놓인 지점**으로 정한다 (#115)
    fn win(label: &str, r: Rect) -> ((String, String), Rect) {
        ((label.into(), format!("note-{label}")), r)
    }

    #[test]
    fn drop_target_is_the_window_under_the_cursor() {
        let c = [win("a", (0.0, 0.0, 200.0, 200.0))];
        assert_eq!(drop_target((100.0, 100.0), &c).unwrap().0, "a");
    }

    #[test]
    fn no_target_when_cursor_is_outside_every_window() {
        // 겹쳐 두기만 하고 빈 바탕에 놓으면 합쳐지지 않는다 — 겹침 면적으로
        // 재던 이전 방식이 우연히 합쳐 버리던 자리
        let c = [win("a", (0.0, 0.0, 200.0, 200.0))];
        assert!(drop_target((400.0, 100.0), &c).is_none());
    }

    #[test]
    fn overlapping_candidates_pick_the_smaller_window() {
        // 큰 창 위에 작은 창이 얹힌 배치에서 사용자가 겨냥한 쪽은 위의 작은 창
        let c = [
            win("big", (0.0, 0.0, 400.0, 400.0)),
            win("small", (50.0, 50.0, 100.0, 100.0)),
        ];
        assert_eq!(drop_target((100.0, 100.0), &c).unwrap().0, "small");
    }

    #[test]
    fn window_edges_are_half_open() {
        // 오른쪽·아래 경계는 다음 창의 몫 — 나란히 붙은 창에서 겹치지 않게
        let c = [win("a", (0.0, 0.0, 100.0, 100.0))];
        assert_eq!(drop_target((0.0, 0.0), &c).unwrap().0, "a");
        assert!(drop_target((100.0, 50.0), &c).is_none());
        assert!(drop_target((50.0, 100.0), &c).is_none());
    }

    #[test]
    fn negative_coordinates_work() {
        // 보조 모니터가 주 모니터 왼쪽/위(음수 좌표)에 배치된 실사용 구성
        let c = [win("a", (-1000.0, -500.0, 100.0, 100.0))];
        assert_eq!(drop_target((-950.0, -450.0), &c).unwrap().0, "a");
        assert!(drop_target((-1100.0, -450.0), &c).is_none());
    }

    #[test]
    fn no_candidates_means_no_target() {
        let c: [((String, String), Rect); 0] = [];
        assert!(drop_target((0.0, 0.0), &c).is_none());
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

    fn hidden_note(id: &str) -> Note {
        let mut n = note(id);
        n.meta.hidden = true;
        n
    }

    #[test]
    fn visible_members_drops_hidden_pages() {
        // 숨긴 장은 넘기기·점의 순환에서 빠진다 (목록에서 열면 다시 합류)
        let ids: Vec<String> = visible_members(vec![note("a"), hidden_note("b"), note("c")])
            .into_iter()
            .map(|n| n.meta.id)
            .collect();
        assert_eq!(ids, ["a", "c"]);
    }

    #[test]
    fn visible_members_keeps_order_and_all_visible() {
        let ids: Vec<String> = visible_members(vec![note("a"), note("b")])
            .into_iter()
            .map(|n| n.meta.id)
            .collect();
        assert_eq!(ids, ["a", "b"]);
    }

    #[test]
    fn deleting_a_member_hands_the_window_to_the_next_page() {
        // 회귀: 모음집 하나 = 창 하나라, 한 장을 지웠다고 창을 파괴하면 모음집
        // 전체가 화면에서 사라진다. 창은 남은 장에게 넘어가야 한다.
        let m = [note("a"), note("b"), note("c")];
        assert_eq!(pop_out_next(&m, "b", &set(&["b"])).unwrap().meta.id, "c");
    }

    #[test]
    fn deleting_a_solo_note_has_no_next_so_the_window_goes() {
        let m: [Note; 0] = [];
        assert!(pop_out_next(&m, "a", &set(&["a"])).is_none());
    }

    #[test]
    fn hiding_the_last_visible_page_leaves_no_next() {
        // 숨긴 뒤 전환할 장이 없으면 창까지 내려간다(프런트가 close)
        let m = visible_members(vec![note("a"), hidden_note("b")]);
        assert!(pop_out_next(&m, "a", &set(&["a"])).is_none());
    }
}
