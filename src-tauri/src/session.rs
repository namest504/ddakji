//! 창 복원 정책 — 어떤 노트를 창으로 열지 결정하고 표시한다.
//!
//! 모음집은 "그룹당 창 하나"가 기본이다. 시작(#25)이든 두 번째 실행·Alt-Tab
//! 복귀(#69)든 같은 규칙을 쓰고, 전부 펼치기는 트레이 메뉴만 수행한다.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use tauri::Manager;

use crate::store::{MetaPatch, Note, Store};
use crate::{commands, windows, Result};

/// 시작 시 열 노트 선택: 숨김 노트는 제외하고, 모음집은 그룹당 대표 노트
/// ((group_order, created_at) 오름차순 첫 번째) 하나만 연다 — 재시작 때마다
/// 합쳐둔 창이 전부 펼쳐지던 문제 (#25). 전부 펼치기는 트레이 메뉴로.
pub fn startup_notes<'a>(notes: &'a [Note], cursors: &HashMap<String, String>) -> Vec<&'a Note> {
    let visible: Vec<&Note> = notes.iter().filter(|n| !n.meta.hidden).collect();
    restore_notes(&visible, &HashSet::new(), cursors)
}

/// 창 복원 시 열 노트 선택 (#69): 무소속 노트는 전부, 모음집은 이미 떠 있는
/// 멤버 창(open_ids)이 있으면 그 창들만 존중(새 창을 열지 않음 — 사용자가
/// 보던 멤버·팝아웃 유지)하고, 없으면 대표((group_order, created_at) 최소)
/// 하나만 연다. 숨김 여부는 호출자가 정리한다.
pub fn restore_notes<'a>(
    notes: &[&'a Note],
    open_ids: &HashSet<String>,
    cursors: &HashMap<String, String>,
) -> Vec<&'a Note> {
    let mut group_first: HashMap<&str, &'a Note> = HashMap::new();
    let mut group_open: HashSet<&str> = HashSet::new();
    for n in notes.iter().copied() {
        if let Some(g) = n.meta.group.as_deref() {
            let cur = group_first.entry(g).or_insert(n);
            // 마지막으로 보던 장이 있으면 그 장이 대표다 — 4장을 보다 껐으면
            // 4장부터 (QA 2026-08-14). 커서가 가리키는 노트가 이 목록(=보이는
            // 노트)에 없으면 자연히 기본 규칙(순서·생성일 최소)으로 돌아간다.
            let n_is_cursor = cursors.get(g).is_some_and(|id| *id == n.meta.id);
            let cur_is_cursor = cursors.get(g).is_some_and(|id| *id == cur.meta.id);
            let n_earlier = (n.meta.group_order, n.meta.created_at.as_str())
                < (cur.meta.group_order, cur.meta.created_at.as_str());
            if n_is_cursor || (!cur_is_cursor && n_earlier) {
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

/// 두 번째 실행·Alt-Tab 복귀: **숨겨지지 않은** 노트를 표시하고 모음집은
/// 접힘 유지 (#69). 숨김은 건드리지 않는다 — 예전에 트레이 "펼치기"와 같은
/// 함수를 쓰다 Ctrl+W로 치운 노트가 재시작마다 되살아났다 (QA 2026-08-14).
pub fn show_all_notes(app: &tauri::AppHandle) -> Result<()> {
    show_notes(app, false)
}

/// 트레이 "모든 노트 펼치기": 숨김까지 풀고 전부 표시한다. 숨김을 푸는
/// 유일한 경로다.
pub fn unhide_and_show_all(app: &tauri::AppHandle) -> Result<()> {
    show_notes(app, true)
}

/// 표시할 노트를 고른다. `clear_hidden`이면 숨김 플래그를 지우며 전부,
/// 아니면 숨김을 존중해 보이는 것만.
fn prepare_notes(store: &Store, clear_hidden: bool) -> Vec<Note> {
    let mut notes = store.list();
    if !clear_hidden {
        notes.retain(|n| !n.meta.hidden);
        return notes;
    }
    for n in &mut notes {
        if !n.meta.hidden {
            continue;
        }
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
    notes
}

fn show_notes(app: &tauri::AppHandle, clear_hidden: bool) -> Result<()> {
    let s = app.state::<Mutex<Store>>();
    let (notes, cursors): (Vec<Note>, HashMap<String, String>) = {
        let store = s.lock().unwrap();
        (prepare_notes(&store, clear_hidden), store.group_cursors())
    };
    let open_ids: HashSet<String> = app
        .try_state::<commands::WindowNotes>()
        .and_then(|wn| wn.0.lock().ok().map(|m| m.values().cloned().collect()))
        .unwrap_or_default();
    let refs: Vec<&Note> = notes.iter().collect();
    for n in restore_notes(&refs, &open_ids, &cursors) {
        windows::open_note_window(app, n)?;
    }
    Ok(())
}

#[cfg(test)]
mod prepare_tests {
    use super::*;
    use tempfile::TempDir;

    fn store_with_hidden() -> (TempDir, Store) {
        let d = TempDir::new().unwrap();
        let s = Store::new(d.path()).unwrap();
        let a = s.create().unwrap();
        s.save_body(&a.meta.id, "보이는 노트").unwrap();
        let b = s.create().unwrap();
        s.save_meta(
            &b.meta.id,
            &MetaPatch {
                hidden: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        (d, s)
    }

    #[test]
    fn revealing_respects_hidden() {
        // 두 번째 실행·Alt-Tab 복귀는 창만 띄운다 — 숨김을 풀면 Ctrl+W로
        // 치워 둔 노트가 재시작마다 되살아난다 (QA 2026-08-14).
        let (_d, s) = store_with_hidden();
        let shown = prepare_notes(&s, false);
        assert_eq!(shown.len(), 1, "숨긴 노트는 빠져야 한다");
        let still_hidden = s.list().iter().filter(|n| n.meta.hidden).count();
        assert_eq!(still_hidden, 1, "숨김 플래그를 건드리면 안 된다");
    }

    #[test]
    fn unhiding_clears_the_flag_for_all() {
        // 트레이 "모든 노트 펼치기"만이 숨김을 푸는 유일한 경로다.
        let (_d, s) = store_with_hidden();
        let shown = prepare_notes(&s, true);
        assert_eq!(shown.len(), 2);
        let still_hidden = s.list().iter().filter(|n| n.meta.hidden).count();
        assert_eq!(still_hidden, 0);
    }
}

#[cfg(test)]
mod startup_tests {
    use super::*;
    use crate::store::NoteMeta;

    fn note(id: &str, group: Option<&str>, order: u32, created: &str, hidden: bool) -> Note {
        let mut meta = NoteMeta::new_default(id.into());
        meta.group = group.map(String::from);
        meta.group_order = order;
        meta.created_at = created.into();
        meta.hidden = hidden;
        Note {
            meta,
            body: String::new(),
        }
    }

    fn ids(notes: &[Note]) -> Vec<&str> {
        startup_notes(notes, &HashMap::new())
            .iter()
            .map(|n| n.meta.id.as_str())
            .collect()
    }

    fn ids_with<'a>(notes: &'a [Note], cursors: &[(&str, &str)]) -> Vec<&'a str> {
        let map: HashMap<String, String> = cursors
            .iter()
            .map(|(g, i)| (g.to_string(), i.to_string()))
            .collect();
        startup_notes(notes, &map)
            .iter()
            .map(|n| n.meta.id.as_str())
            .collect()
    }

    #[test]
    fn cursor_overrides_representative() {
        // 1~5장 중 4장을 보다 껐으면 재시작도 4장부터 (QA 2026-08-14)
        let notes = vec![
            note("p1", Some("모음"), 0, "2026-08-01", false),
            note("p4", Some("모음"), 3, "2026-08-04", false),
        ];
        assert_eq!(ids_with(&notes, &[("모음", "p4")]), vec!["p4"]);
    }

    #[test]
    fn stale_cursor_falls_back_to_representative() {
        // 커서가 가리키던 노트가 지워졌거나 다른 모음집으로 갔으면 기본 규칙으로
        let notes = vec![
            note("p1", Some("모음"), 0, "2026-08-01", false),
            note("p2", Some("모음"), 1, "2026-08-02", false),
        ];
        assert_eq!(ids_with(&notes, &[("모음", "gone")]), vec!["p1"]);
        // 커서 멤버가 숨김이어도 마찬가지 — 숨긴 장을 되살리는 문이 되면 안 된다
        let notes2 = vec![
            note("p1", Some("모음"), 0, "2026-08-01", false),
            note("p4", Some("모음"), 3, "2026-08-04", true),
        ];
        assert_eq!(ids_with(&notes2, &[("모음", "p4")]), vec!["p1"]);
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
        let open_ids: HashSet<String> = open.iter().map(|s| s.to_string()).collect();
        restore_notes(&refs, &open_ids, &HashMap::new())
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
