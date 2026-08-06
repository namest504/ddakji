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
            commands::set_last_viewed,
            commands::get_last_viewed,
            commands::set_storage_path,
            commands::nav_group,
            commands::nav_to,
            commands::group_members,
            commands::check_merge,
            commands::merge_preview,
            commands::pop_out,
            commands::list_groups,
        ])
        .setup(|app| {
            let id_dir = app.path().app_data_dir()?;
            // 기본 %APPDATA%/StickDown (충돌 시 식별자 폴더), 설정으로 변경 가능
            let root = store::resolve_data_root(&id_dir);
            let store = Store::new(&root)?;
            let notes = store.list();
            // 커스텀 저장 경로에서도 이미지(asset)가 로드되도록 스코프 허용
            let _ = app.asset_protocol_scope().allow_directory(root.join("assets"), true);
            app.manage(Mutex::new(store));
            app.manage(commands::IdDir(id_dir));
            app.manage(commands::LastViewed(Mutex::new(None)));
            app.manage(commands::WindowNotes(Mutex::new(std::collections::HashMap::new())));
            tray::create_tray(app.handle())?;
            // Alt-Tab/작업표시줄 대표 창 (노트들은 skip_taskbar)
            windows::ensure_main_stub(app.handle())?;
            if notes.is_empty() {
                let s = app.state::<Mutex<Store>>();
                let note = s.lock().unwrap().create()?;
                windows::open_note_window(app.handle(), &note)?;
            } else {
                for n in startup_notes(&notes) {
                    windows::open_note_window(app.handle(), n)?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == windows::STUB_LABEL {
                match event {
                    // Alt-Tab·작업표시줄에서 앱을 선택하면(복원·포커스) 스텁은 다시
                    // 화면 밖·최소화로 되돌리고 모든 노트를 표시한다
                    tauri::WindowEvent::Focused(true) => {
                        // 셸이 화면 안으로 끌어왔을 수 있으니 항상 화면 밖으로 되돌린다
                        let _ = window
                            .set_position(tauri::LogicalPosition::new(-30000.0, -30000.0));
                        let _ = crate::show_all_notes(&window.app_handle());
                    }
                    // 작업 표시줄에서 "창 닫기" = 명시적 종료 의도 — 앱을 완전히 끝낸다
                    tauri::WindowEvent::CloseRequested { .. } => {
                        window.app_handle().exit(0);
                    }
                    _ => {}
                }
                return;
            }
            let app = window.app_handle();
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // 창이 표시 중인 노트는 매핑이 진실 (#25 — label은 불변, 노트는 동적)
                    let id = app.try_state::<commands::WindowNotes>().and_then(|wn| {
                        wn.0.lock().ok().and_then(|m| m.get(window.label()).cloned())
                    });
                    if let Some(id) = id {
                        // 닫기 = 숨김 (삭제 아님), 트레이 상주
                        api.prevent_close();
                        let _ = window.hide();
                        let s = app.state::<Mutex<Store>>();
                        let _ = s.lock().unwrap().save_meta(
                            &id,
                            &MetaPatch {
                                hidden: Some(true),
                                ..Default::default()
                            },
                        );
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

/// 시작 시 열 노트 선택: 숨김 노트는 제외하고, 모음집은 그룹당 대표 노트
/// ((group_order, created_at) 오름차순 첫 번째) 하나만 연다 — 재시작 때마다
/// 합쳐둔 창이 전부 펼쳐지던 문제 (#25). 전부 펼치기는 트레이 메뉴로.
pub fn startup_notes(notes: &[store::Note]) -> Vec<&store::Note> {
    let visible: Vec<&store::Note> = notes.iter().filter(|n| !n.meta.hidden).collect();
    restore_notes(&visible, &std::collections::HashSet::new())
}

/// 창 복원 시 열 노트 선택 (#69): 무소속 노트는 전부, 모음집은 이미 떠 있는
/// 멤버 창(open_ids)이 있으면 그 창들만 존중(새 창을 열지 않음 — 사용자가
/// 보던 멤버·팝아웃 유지)하고, 없으면 대표((group_order, created_at) 최소)
/// 하나만 연다. 숨김 여부는 호출자가 정리한다.
pub fn restore_notes<'a>(
    notes: &[&'a store::Note],
    open_ids: &std::collections::HashSet<String>,
) -> Vec<&'a store::Note> {
    use std::collections::{HashMap, HashSet};
    let mut group_first: HashMap<&str, &store::Note> = HashMap::new();
    let mut group_open: HashSet<&str> = HashSet::new();
    for n in notes.iter().copied() {
        if let Some(g) = n.meta.group.as_deref() {
            let cur = group_first.entry(g).or_insert(n);
            if (n.meta.group_order, n.meta.created_at.as_str())
                < (cur.meta.group_order, cur.meta.created_at.as_str())
            {
                *cur = n;
            }
            if open_ids.contains(&n.meta.id) {
                group_open.insert(g);
            }
        }
    }
    let mut represented: HashSet<&str> = HashSet::new();
    let mut out = Vec::new();
    for n in notes.iter().copied() {
        let Some(g) = n.meta.group.as_deref() else {
            out.push(n);
            continue;
        };
        if group_open.contains(g) {
            if open_ids.contains(&n.meta.id) {
                out.push(n);
            }
        } else if represented.insert(g) {
            out.push(group_first[g]);
        }
    }
    out
}

#[cfg(test)]
mod startup_tests {
    use super::startup_notes;
    use crate::store::{Note, NoteMeta};

    fn note(id: &str, group: Option<&str>, order: u32, created: &str, hidden: bool) -> Note {
        let mut meta = NoteMeta::new_default(id.into());
        meta.group = group.map(String::from);
        meta.group_order = order;
        meta.created_at = created.into();
        meta.hidden = hidden;
        Note { meta, body: String::new() }
    }

    fn ids(notes: &[Note]) -> Vec<&str> {
        startup_notes(notes).iter().map(|n| n.meta.id.as_str()).collect()
    }

    #[test]
    fn group_opens_single_representative_by_order() {
        // 재시작 시 그룹이 전부 펼쳐지던 회귀(#25)의 가드
        let notes = vec![
            note("b", Some("모음"), 2, "2026-08-01", false),
            note("a", Some("모음"), 0, "2026-08-02", false),
            note("c", Some("모음"), 1, "2026-08-03", false),
        ];
        assert_eq!(ids(&notes), vec!["a"]);
    }

    #[test]
    fn order_tie_broken_by_created_at() {
        let notes = vec![
            note("late", Some("모음"), 0, "2026-08-05", false),
            note("early", Some("모음"), 0, "2026-08-01", false),
        ];
        assert_eq!(ids(&notes), vec!["early"]);
    }

    #[test]
    fn hidden_notes_are_skipped() {
        let notes = vec![
            note("shown", None, 0, "2026-08-01", false),
            note("hidden", None, 0, "2026-08-02", true),
        ];
        assert_eq!(ids(&notes), vec!["shown"]);
    }

    #[test]
    fn hidden_group_representative_falls_to_next_member() {
        // 대표(첫 순서) 노트가 숨김이면 다음 멤버가 그룹 창을 대표한다
        let notes = vec![
            note("first", Some("모음"), 0, "2026-08-01", true),
            note("second", Some("모음"), 1, "2026-08-02", false),
        ];
        assert_eq!(ids(&notes), vec!["second"]);
    }

    #[test]
    fn ungrouped_visible_notes_all_open() {
        let notes = vec![
            note("a", None, 0, "2026-08-01", false),
            note("b", None, 0, "2026-08-02", false),
            note("g1", Some("모음"), 0, "2026-08-03", false),
            note("g2", Some("모음"), 1, "2026-08-04", false),
        ];
        let mut got = ids(&notes);
        got.sort();
        assert_eq!(got, vec!["a", "b", "g1"]);
    }

    #[test]
    fn all_hidden_opens_nothing() {
        // 전부 숨김이면 트레이 상주만 — 창을 강제로 열지 않는다
        let notes = vec![
            note("a", None, 0, "2026-08-01", true),
            note("g", Some("모음"), 0, "2026-08-02", true),
        ];
        assert!(ids(&notes).is_empty());
    }

    // ---- restore_notes (#69): 두 번째 실행·Alt-Tab 복귀의 접힘 유지 ----

    fn restore_ids(notes: &[Note], open: &[&str]) -> Vec<String> {
        let refs: Vec<&Note> = notes.iter().collect();
        let open_ids: std::collections::HashSet<String> =
            open.iter().map(|s| s.to_string()).collect();
        super::restore_notes(&refs, &open_ids)
            .iter()
            .map(|n| n.meta.id.clone())
            .collect()
    }

    #[test]
    fn restore_without_windows_opens_representative_per_group() {
        // 창이 하나도 없으면(시작 직후와 동일) 그룹당 대표 1창 + 무소속 전부
        let notes = vec![
            note("loose", None, 0, "2026-08-01", false),
            note("rep", Some("모음"), 0, "2026-08-02", false),
            note("m2", Some("모음"), 1, "2026-08-03", false),
        ];
        assert_eq!(restore_ids(&notes, &[]), vec!["loose", "rep"]);
    }

    #[test]
    fn restore_respects_open_member_instead_of_representative() {
        // 사용자가 그룹의 3번째 멤버를 보던 창이 떠 있으면 그 창만 존중 —
        // 대표를 새 창으로 또 열면 같은 그룹이 두 창이 된다
        let notes = vec![
            note("rep", Some("모음"), 0, "2026-08-01", false),
            note("third", Some("모음"), 2, "2026-08-03", false),
        ];
        assert_eq!(restore_ids(&notes, &["third"]), vec!["third"]);
    }

    #[test]
    fn restore_keeps_all_popped_out_members() {
        // 팝아웃으로 한 그룹의 창이 여럿 떠 있으면 전부 유지, 새 창은 없다
        let notes = vec![
            note("a", Some("모음"), 0, "2026-08-01", false),
            note("b", Some("모음"), 1, "2026-08-02", false),
            note("c", Some("모음"), 2, "2026-08-03", false),
        ];
        assert_eq!(restore_ids(&notes, &["a", "c"]), vec!["a", "c"]);
    }

    #[test]
    fn restore_handles_groups_independently() {
        // 창이 있는 그룹은 그 창을, 없는 그룹은 대표를
        let notes = vec![
            note("a1", Some("A"), 0, "2026-08-01", false),
            note("a2", Some("A"), 1, "2026-08-02", false),
            note("b1", Some("B"), 0, "2026-08-03", false),
            note("b2", Some("B"), 1, "2026-08-04", false),
        ];
        assert_eq!(restore_ids(&notes, &["a2"]), vec!["a2", "b1"]);
    }

    #[test]
    fn restore_includes_ungrouped_regardless_of_open_state() {
        // 무소속은 이미 떠 있어도 포함 — 창 단위 dedupe(매핑)가 show/focus 처리
        let notes = vec![note("solo", None, 0, "2026-08-01", false)];
        assert_eq!(restore_ids(&notes, &["solo"]), vec!["solo"]);
        assert_eq!(restore_ids(&notes, &[]), vec!["solo"]);
    }
}

/// 두 번째 실행·Alt-Tab 복귀: 전 노트를 표시하되 모음집은 접힘 유지 (#69).
/// 그룹까지 전부 펼치던 이전 동작이 "재시작하면 그룹이 풀린다"의 재발 원인이었다.
pub fn show_all_notes(app: &tauri::AppHandle) -> tauri::Result<()> {
    show_notes(app, false)
}

/// 트레이 "모든 노트 펼치기": 그룹 멤버까지 전부 개별 창으로 — 명시적 의도만
pub fn expand_all_notes(app: &tauri::AppHandle) -> tauri::Result<()> {
    show_notes(app, true)
}

fn show_notes(app: &tauri::AppHandle, expand_groups: bool) -> tauri::Result<()> {
    let s = app.state::<Mutex<Store>>();
    let mut notes: Vec<store::Note> = {
        let store = s.lock().unwrap();
        store.list()
    };
    // 숨김 해제는 전 노트에 — 접힘은 데이터가 아니라 창을 어디에 열지의 문제
    for n in &mut notes {
        if !n.meta.hidden {
            continue;
        }
        let store = s.lock().unwrap();
        if let Ok(updated) = store.save_meta(
            &n.meta.id,
            &MetaPatch {
                hidden: Some(false),
                ..Default::default()
            },
        ) {
            *n = updated;
        }
    }
    let open_ids: std::collections::HashSet<String> = app
        .try_state::<commands::WindowNotes>()
        .and_then(|wn| wn.0.lock().ok().map(|m| m.values().cloned().collect()))
        .unwrap_or_default();
    let refs: Vec<&store::Note> = notes.iter().collect();
    let selected = if expand_groups {
        refs
    } else {
        restore_notes(&refs, &open_ids)
    };
    for n in selected {
        windows::open_note_window(app, n)?;
    }
    Ok(())
}
