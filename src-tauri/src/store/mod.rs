//! 노트 저장소 — 디스크의 노트·에셋·설정에 대한 유일한 접근 경로.

mod model;
mod paths;

pub use model::{next_new_group_name, MetaPatch, Note, NoteMeta, Settings, WindowBounds};
pub use paths::{default_data_root, move_storage, resolve_data_root};

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use paths::{new_file_id, validate_ext, validate_id};

use crate::{Error, Result};

/// 외부(CLI·동기화 등)에서 바뀐 노트 — [`Store::external_changes`]의 결과 (#12)
#[derive(Debug, PartialEq, Eq)]
pub enum ExternalChange {
    /// 새로 생겼거나 내용이 바뀐 노트 id
    Changed(String),
    /// 밖에서 삭제된 노트 id
    Removed(String),
}

pub struct Store {
    root: PathBuf,
    settings: Settings,
    /// 앱이 아는 디스크 상태 (id → mtime). 우리가 쓴 파일은 즉시 반영되므로,
    /// 디스크와의 차이는 곧 **외부 변경**이다 (#12 외부 변경 브리지).
    /// updated_at이 아니라 mtime을 쓰는 이유: save_meta는 updated_at을 바꾸지 않는다.
    disk_state: Mutex<HashMap<String, SystemTime>>,
}

impl Store {
    pub fn new(root: &Path) -> Result<Store> {
        fs::create_dir_all(root.join("notes"))?;
        fs::create_dir_all(root.join("assets"))?;
        // settings.json이 없거나 파손이면 기본값 — 노트 접근을 막지 않는다
        let settings = fs::read_to_string(root.join("settings.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let store = Store {
            root: root.to_path_buf(),
            settings,
            disk_state: Mutex::new(HashMap::new()),
        };
        // 시작 시점의 디스크가 기준선 — 이후 우리가 쓰지 않은 차이만 외부 변경
        *store.disk_lock() = store.scan_disk();
        Ok(store)
    }

    fn disk_lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, SystemTime>> {
        // 내부 뮤텍스 — 패닉 오염 시에도 스냅숏은 계속 쓸 수 있다
        self.disk_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// notes/ 의 현재 (id → mtime)
    fn scan_disk(&self) -> HashMap<String, SystemTime> {
        let mut map = HashMap::new();
        let Ok(rd) = fs::read_dir(self.notes_dir()) else {
            return map;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "md") != Some(true) {
                continue;
            }
            let (Some(id), Ok(meta)) = (p.file_stem().and_then(|s| s.to_str()), e.metadata())
            else {
                continue;
            };
            if let Ok(mtime) = meta.modified() {
                map.insert(id.to_string(), mtime);
            }
        }
        map
    }

    /// 마지막 확인 이후의 **외부** 변경 목록 — 우리가 쓴 파일은 나오지 않는다.
    /// 호출 시 스냅숏이 현재 디스크로 갱신되므로 같은 변경이 두 번 나오지 않는다.
    pub fn external_changes(&self) -> Vec<ExternalChange> {
        let current = self.scan_disk();
        let mut known = self.disk_lock();
        let mut out = Vec::new();
        for (id, mtime) in &current {
            if known.get(id) != Some(mtime) {
                out.push(ExternalChange::Changed(id.clone()));
            }
        }
        for id in known.keys() {
            if !current.contains_key(id) {
                out.push(ExternalChange::Removed(id.clone()));
            }
        }
        *known = current;
        out
    }

    /// 우리가 방금 쓴 파일을 스냅숏에 반영 — 외부 변경으로 오인 방지
    fn mark_written(&self, id: &str) {
        if let Ok(meta) = fs::metadata(self.note_path(id)) {
            if let Ok(mtime) = meta.modified() {
                self.disk_lock().insert(id.to_string(), mtime);
            }
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.clone()
    }

    pub fn set_settings(&mut self, s: &Settings) -> Result<()> {
        let path = self.root.join("settings.json");
        let tmp = self
            .root
            .join(format!("settings.json.{}.tmp", uuid::Uuid::now_v7()));
        fs::write(
            &tmp,
            serde_json::to_string_pretty(s).expect("settings serialize"),
        )?;
        fs::rename(&tmp, &path)?;
        self.settings = s.clone();
        Ok(())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn notes_dir(&self) -> PathBuf {
        self.root.join("notes")
    }

    fn note_path(&self, id: &str) -> PathBuf {
        self.notes_dir().join(format!("{id}.md"))
    }

    /// 노트 파일의 실제 경로 — "탐색기에서 보기"용 (#98). 없으면 NoteNotFound.
    pub fn note_file(&self, id: &str) -> Result<PathBuf> {
        validate_id(id)?;
        let p = self.note_path(id);
        if p.is_file() {
            Ok(p)
        } else {
            Err(Error::NoteNotFound)
        }
    }

    fn write_atomic(&self, note: &Note) -> Result<()> {
        let path = self.note_path(&note.meta.id);
        // Use unique tmp name to avoid concurrent write conflicts
        let tmp_id = uuid::Uuid::now_v7().to_string();
        let tmp = path.with_extension(format!("md.{}.tmp", tmp_id));
        fs::write(&tmp, note.to_file_string())?;
        fs::rename(&tmp, &path)?;
        self.mark_written(&note.meta.id);
        Ok(())
    }

    pub fn list(&self) -> Vec<Note> {
        let mut notes: Vec<Note> = fs::read_dir(self.notes_dir())
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
                    .filter_map(|e| {
                        let id = e.path().file_stem()?.to_str()?.to_string();
                        let content = fs::read_to_string(e.path()).ok()?;
                        let (note, recovered) = Note::from_file_string(&id, &content);
                        if recovered {
                            // Persist the synthesized meta once so it doesn't get
                            // regenerated (fresh updated_at, hidden=false) on every
                            // subsequent read/poll.
                            let _ = self.write_atomic(&note);
                        }
                        Some(note)
                    })
                    .collect()
            })
            .unwrap_or_default();
        notes.sort_by(|a, b| b.meta.updated_at.cmp(&a.meta.updated_at));
        notes
    }

    pub fn load(&self, id: &str) -> Option<Note> {
        // Return None for invalid ids instead of error
        if validate_id(id).is_err() {
            return None;
        }
        let content = fs::read_to_string(self.note_path(id)).ok()?;
        let (note, recovered) = Note::from_file_string(id, &content);
        if recovered {
            // Same rationale as list(): stabilize recovered meta on disk.
            let _ = self.write_atomic(&note);
        }
        Some(note)
    }

    pub fn create(&self) -> Result<Note> {
        let id = new_file_id();
        let mut meta = NoteMeta::new_default(id);
        meta.color = self.settings.default_color.clone();
        meta.font_family = self.settings.default_font_family.clone();
        meta.font_size = self.settings.default_font_size;
        let note = Note {
            meta,
            body: String::new(),
        };
        self.write_atomic(&note)?;
        Ok(note)
    }

    pub fn save_body(&self, id: &str, body: &str) -> Result<Note> {
        validate_id(id)?;
        let mut note = self.load(id).ok_or(Error::NoteNotFound)?;
        note.body = body.to_string();
        note.meta.updated_at = chrono::Local::now().to_rfc3339();
        self.write_atomic(&note)?;
        Ok(note)
    }

    pub fn save_meta(&self, id: &str, patch: &MetaPatch) -> Result<Note> {
        validate_id(id)?;
        let next_order = patch
            .group
            .as_deref()
            .filter(|g| !g.is_empty())
            .map(|g| self.next_group_order(g))
            .unwrap_or(0);
        let mut note = self.load(id).ok_or(Error::NoteNotFound)?;
        let old_group = note.meta.group.clone();
        let m = &mut note.meta;
        if let Some(v) = &patch.color {
            m.color = v.clone();
        }
        if let Some(v) = patch.font_size {
            m.font_size = v;
        }
        if let Some(v) = &patch.font_family {
            m.font_family = v.clone();
        }
        if let Some(v) = patch.viewer_mode {
            m.viewer_mode = v;
        }
        if let Some(v) = patch.always_on_top {
            m.always_on_top = v;
        }
        if let Some(v) = patch.hidden {
            m.hidden = v;
        }
        if let Some(v) = &patch.window {
            m.window = v.clone();
        }
        if let Some(v) = &patch.title {
            m.title = if v.is_empty() { None } else { Some(v.clone()) };
        }
        if let Some(v) = &patch.group {
            if v.is_empty() {
                m.group = None;
            } else {
                if m.group.as_deref() != Some(v.as_str()) {
                    m.group_order = next_order;
                }
                m.group = Some(v.clone());
            }
        }
        if let Some(v) = patch.group_order {
            m.group_order = v;
        }
        self.write_atomic(&note)?;
        // 이 노트가 모음집에서 빠졌다면(해제·이적) 혼자 남은 모음집은 해제한다 (#77)
        if let Some(og) = old_group {
            if note.meta.group.as_deref() != Some(og.as_str()) {
                self.dissolve_if_single(&og)?;
            }
        }
        Ok(note)
    }

    /// 멤버가 1명뿐인 모음집은 모음집이 아니다 — 자동 해제 (#77 룰3).
    /// "모음집 = 창 하나, 넘기기는 그 창에서만" 불변식의 데이터 쪽 반쪽.
    fn dissolve_if_single(&self, group: &str) -> Result<()> {
        let members = self.group_notes(group);
        if members.len() == 1 {
            self.save_meta(
                &members[0].meta.id,
                &MetaPatch {
                    group: Some(String::new()),
                    ..Default::default()
                },
            )?;
        }
        Ok(())
    }

    fn next_group_order(&self, group: &str) -> u32 {
        self.list()
            .iter()
            .filter(|n| n.meta.group.as_deref() == Some(group))
            .map(|n| n.meta.group_order)
            .max()
            .map(|m| m + 1)
            .unwrap_or(0)
    }

    /// 그룹 노트를 (group_order, created_at) 오름차순으로
    pub fn group_notes(&self, group: &str) -> Vec<Note> {
        let mut v: Vec<Note> = self
            .list()
            .into_iter()
            .filter(|n| n.meta.group.as_deref() == Some(group))
            .collect();
        v.sort_by(|a, b| {
            a.meta
                .group_order
                .cmp(&b.meta.group_order)
                .then_with(|| a.meta.created_at.cmp(&b.meta.created_at))
        });
        v
    }

    /// 드래그 합치기: moved(와 그 모음집 전체)를 target의 모음집으로 통합.
    /// target이 무소속이면 "새 그룹 N"을 만들어 target부터 편입. 이미 같은
    /// 모음집이면 변경 없음(false).
    pub fn merge_note_groups(&self, moved_id: &str, target_id: &str) -> Result<bool> {
        let target = self.load(target_id).ok_or(Error::NoteNotFound)?;
        let moved = self.load(moved_id).ok_or(Error::NoteNotFound)?;
        if target.meta.group.is_some() && target.meta.group == moved.meta.group {
            return Ok(false);
        }
        let group = match target.meta.group.clone() {
            Some(g) => g,
            None => {
                let name = next_new_group_name(&self.group_names());
                self.save_meta(
                    target_id,
                    &MetaPatch {
                        group: Some(name.clone()),
                        ..Default::default()
                    },
                )?;
                name
            }
        };
        match moved.meta.group.clone() {
            Some(old) => {
                for m in self.group_notes(&old) {
                    self.save_meta(
                        &m.meta.id,
                        &MetaPatch {
                            group: Some(group.clone()),
                            ..Default::default()
                        },
                    )?;
                }
            }
            None => {
                self.save_meta(
                    moved_id,
                    &MetaPatch {
                        group: Some(group.clone()),
                        ..Default::default()
                    },
                )?;
            }
        }
        Ok(true)
    }

    pub fn group_names(&self) -> Vec<String> {
        let mut v: Vec<String> = self
            .list()
            .into_iter()
            .filter_map(|n| n.meta.group)
            .collect();
        v.sort();
        v.dedup();
        v
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        validate_id(id)?;
        let group = self.load(id).and_then(|n| n.meta.group);
        fs::remove_file(self.note_path(id)).map_err(Error::note_io)?;
        self.disk_lock().remove(id);
        let assets = self.root.join("assets").join(id);
        if assets.exists() {
            fs::remove_dir_all(assets)?;
        }
        // 삭제로 혼자 남은 모음집도 해제 (#77 룰3)
        if let Some(g) = group {
            self.dissolve_if_single(&g)?;
        }
        Ok(())
    }

    pub fn save_asset(&self, note_id: &str, ext: &str, bytes: &[u8]) -> Result<String> {
        validate_id(note_id)?;
        validate_ext(ext)?;
        let dir = self.root.join("assets").join(note_id);
        fs::create_dir_all(&dir)?;
        let name = format!("{}.{}", new_file_id(), ext);
        fs::write(dir.join(&name), bytes)?;
        Ok(format!("assets/{note_id}/{name}"))
    }

    /// 외부 마크다운 파일을 새 노트로 가져온다 (#72). UTF-8 텍스트만 —
    /// 아닌 파일은 읽기 단계에서 에러가 나고 노트는 만들어지지 않는다.
    pub fn import_markdown_file(&self, src: &Path) -> Result<Note> {
        let body = fs::read_to_string(src)?;
        let note = self.create()?;
        self.save_body(&note.meta.id, &body)
    }

    pub fn import_asset(&self, note_id: &str, src: &Path) -> Result<String> {
        validate_id(note_id)?;
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");
        let bytes = fs::read(src)?;
        self.save_asset(note_id, ext, &bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn store() -> (TempDir, Store) {
        let dir = TempDir::new().unwrap();
        let s = Store::new(dir.path()).unwrap();
        (dir, s)
    }

    #[test]
    fn settings_default_when_file_missing() {
        let (_d, s) = store();
        let st = s.settings();
        assert_eq!(st.default_color, "yellow");
        assert_eq!(st.default_font_family, "system");
        assert_eq!(st.default_font_size, 16);
    }

    #[test]
    fn set_settings_persists_and_applies_to_create() {
        let (d, s) = store();
        let mut s = s;
        s.set_settings(&Settings {
            default_color: "blue".into(),
            default_font_family: "mono".into(),
            default_font_size: 20,
            favorite_fonts: vec!["D2Coding".into()],
            theme: "dark".into(),
        })
        .unwrap();
        let n = s.create().unwrap();
        assert_eq!(n.meta.color, "blue");
        assert_eq!(n.meta.font_family, "mono");
        assert_eq!(n.meta.font_size, 20);
        // 새 Store 인스턴스로 재로드해도 유지
        let s2 = Store::new(d.path()).unwrap();
        assert_eq!(s2.settings().default_font_family, "mono");
    }

    #[test]
    fn create_ids_are_readable_timestamps() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b = s.create().unwrap();
        let re = regex_lite();
        assert!(re(&a.meta.id), "가독 시각 형식이어야 한다: {}", a.meta.id);
        assert_ne!(a.meta.id, b.meta.id, "같은 초에 만들어도 접미사로 구분");
    }

    // 의존성 없이 20260805-134024-a1b2c3 형식 검사
    fn regex_lite() -> impl Fn(&str) -> bool {
        |id: &str| {
            let parts: Vec<&str> = id.split('-').collect();
            parts.len() == 3
                && parts[0].len() == 8
                && parts[0].chars().all(|c| c.is_ascii_digit())
                && parts[1].len() == 6
                && parts[1].chars().all(|c| c.is_ascii_digit())
                && parts[2].len() == 6
                && parts[2].chars().all(|c| c.is_ascii_hexdigit())
        }
    }

    #[test]
    fn merge_groups_moves_whole_collection() {
        let (_d, s) = store();
        let a1 = s.create().unwrap();
        let a2 = s.create().unwrap();
        let t = s.create().unwrap();
        for id in [&a1.meta.id, &a2.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("A".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        // 그룹 A 창을 무소속 t 위로 — 새 그룹이 만들어지고 셋 다 편입
        assert!(s.merge_note_groups(&a1.meta.id, &t.meta.id).unwrap());
        let g = s.load(&t.meta.id).unwrap().meta.group.unwrap();
        assert_eq!(g, "새 그룹 1");
        let members = s.group_notes(&g);
        assert_eq!(members.len(), 3);
        assert_eq!(members[0].meta.id, t.meta.id, "target이 첫 순서");
        // 같은 그룹끼리는 변경 없음
        assert!(!s.merge_note_groups(&a1.meta.id, &t.meta.id).unwrap());
    }

    #[test]
    fn reassigning_same_group_keeps_order() {
        // 같은 그룹을 다시 지정해도(저장 경로가 group을 항상 실어 보내는 경우)
        // 순서가 끝으로 밀리면 안 된다
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b = s.create().unwrap();
        for id in [&a.meta.id, &b.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("X".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        assert_eq!(s.load(&a.meta.id).unwrap().meta.group_order, 0);
        s.save_meta(
            &a.meta.id,
            &MetaPatch {
                group: Some("X".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            s.load(&a.meta.id).unwrap().meta.group_order,
            0,
            "재지정은 순서 유지"
        );
    }

    #[test]
    fn moving_note_between_groups_appends_to_target() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b1 = s.create().unwrap();
        let b2 = s.create().unwrap();
        s.save_meta(
            &a.meta.id,
            &MetaPatch {
                group: Some("A".into()),
                ..Default::default()
            },
        )
        .unwrap();
        for id in [&b1.meta.id, &b2.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("B".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        s.save_meta(
            &a.meta.id,
            &MetaPatch {
                group: Some("B".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let g = s.group_notes("B");
        assert_eq!(g.len(), 3);
        assert_eq!(
            g.last().unwrap().meta.id,
            a.meta.id,
            "옮겨온 노트는 끝 순서"
        );
        assert!(s.group_notes("A").is_empty(), "원래 그룹에서는 빠진다");
    }

    #[test]
    fn merge_grouped_into_grouped_moves_all_after_target() {
        // 모음집 창을 다른 모음집 위에 얹으면 통째로 통합된다 — 대상 멤버가 앞 순서
        let (_d, s) = store();
        let a1 = s.create().unwrap();
        let a2 = s.create().unwrap();
        let b1 = s.create().unwrap();
        let b2 = s.create().unwrap();
        for id in [&a1.meta.id, &a2.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("A".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        for id in [&b1.meta.id, &b2.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("B".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        assert!(s.merge_note_groups(&a1.meta.id, &b1.meta.id).unwrap());
        let ids: Vec<String> = s.group_notes("B").into_iter().map(|n| n.meta.id).collect();
        assert_eq!(
            ids,
            vec![b1.meta.id, b2.meta.id, a1.meta.id.clone(), a2.meta.id]
        );
        assert!(s.group_notes("A").is_empty());
        assert_eq!(
            s.group_names(),
            vec!["B".to_string()],
            "빈 그룹 A는 사라진다"
        );
    }

    #[test]
    fn merge_ungrouped_into_grouped_appends() {
        let (_d, s) = store();
        let t = s.create().unwrap();
        let m = s.create().unwrap();
        s.save_meta(
            &t.meta.id,
            &MetaPatch {
                group: Some("B".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(s.merge_note_groups(&m.meta.id, &t.meta.id).unwrap());
        let g = s.group_notes("B");
        assert_eq!(g.len(), 2);
        assert_eq!(g.last().unwrap().meta.id, m.meta.id);
    }

    #[test]
    fn clearing_one_of_two_members_dissolves_group() {
        // #77 룰3: 멤버 1명뿐인 모음집은 자동 해제
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b = s.create().unwrap();
        for id in [&a.meta.id, &b.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("둘".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        s.save_meta(
            &a.meta.id,
            &MetaPatch {
                group: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            s.load(&b.meta.id).unwrap().meta.group,
            None,
            "혼자 남으면 해제"
        );
        assert!(s.group_names().is_empty());
    }

    #[test]
    fn clearing_one_of_three_members_keeps_group() {
        let (_d, s) = store();
        let ids: Vec<String> = (0..3).map(|_| s.create().unwrap().meta.id).collect();
        for id in &ids {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("셋".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        s.save_meta(
            &ids[0],
            &MetaPatch {
                group: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.group_notes("셋").len(), 2, "둘 남으면 유지");
    }

    #[test]
    fn moving_member_to_other_group_dissolves_old_pair() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b = s.create().unwrap();
        let c = s.create().unwrap();
        for id in [&a.meta.id, &b.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("옛".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        s.save_meta(
            &c.meta.id,
            &MetaPatch {
                group: Some("새".into()),
                ..Default::default()
            },
        )
        .unwrap();
        // a를 새 그룹으로 이적 → 옛 그룹엔 b 혼자 → 해제
        s.save_meta(
            &a.meta.id,
            &MetaPatch {
                group: Some("새".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.load(&b.meta.id).unwrap().meta.group, None);
        assert_eq!(s.group_names(), vec!["새".to_string()]);
    }

    #[test]
    fn deleting_member_dissolves_pair() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b = s.create().unwrap();
        for id in [&a.meta.id, &b.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("둘".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        s.delete(&a.meta.id).unwrap();
        assert_eq!(
            s.load(&b.meta.id).unwrap().meta.group,
            None,
            "삭제로 혼자 남아도 해제"
        );
    }

    #[test]
    fn merge_missing_note_errors() {
        let (_d, s) = store();
        let t = s.create().unwrap();
        assert!(s
            .merge_note_groups("20990101-000000-abcdef", &t.meta.id)
            .is_err());
        assert!(s
            .merge_note_groups(&t.meta.id, "20990101-000000-abcdef")
            .is_err());
    }

    #[test]
    fn group_notes_order_tie_broken_by_created_at() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = s.create().unwrap();
        // 명시적으로 같은 순서를 부여해도 생성 시각으로 안정 정렬
        for id in [&b.meta.id, &a.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("T".into()),
                    group_order: Some(5),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        let g = s.group_notes("T");
        assert_eq!(g[0].meta.id, a.meta.id);
        assert_eq!(g[1].meta.id, b.meta.id);
    }

    #[test]
    fn missing_note_maps_to_note_not_found() {
        // 프런트의 좀비 창 방지는 이 에러가 NOTE_NOT_FOUND로 직렬화되는 데 의존한다
        let (_d, s) = store();
        let gone = "20990101-000000-abcdef";
        assert!(matches!(s.save_body(gone, "x"), Err(Error::NoteNotFound)));
        assert!(matches!(
            s.save_meta(gone, &MetaPatch::default()),
            Err(Error::NoteNotFound)
        ));
        assert!(matches!(s.delete(gone), Err(Error::NoteNotFound)));
    }

    #[test]
    fn id_length_and_charset_boundaries() {
        let (_d, s) = store();
        // 64자는 형식상 유효 — 파일이 없을 뿐
        let ok64 = "a".repeat(64);
        assert!(matches!(s.save_body(&ok64, "x"), Err(Error::NoteNotFound)));
        let too_long = "a".repeat(65);
        assert!(matches!(
            s.save_body(&too_long, "x"),
            Err(Error::Invalid(_))
        ));
        assert!(matches!(
            s.save_body("한글아이디", "x"),
            Err(Error::Invalid(_))
        ));
        assert!(matches!(s.save_body("", "x"), Err(Error::Invalid(_))));
    }

    #[test]
    fn settings_with_unknown_fields_still_load() {
        // 미래 버전이 쓴 settings.json(모르는 필드 포함)도 그대로 읽힌다 — 전방호환
        let d = TempDir::new().unwrap();
        fs::write(
            d.path().join("settings.json"),
            r#"{"default_color":"pink","future_field":{"nested":true}}"#,
        )
        .unwrap();
        let s = Store::new(d.path()).unwrap();
        assert_eq!(s.settings().default_color, "pink");
    }

    #[test]
    fn import_markdown_file_creates_note_with_body() {
        let (_d, s) = store();
        let src = _d.path().join("vim-cheatsheet.md");
        let content = "# Vim 치트시트\n\n| 입력 | 동작 |\n| --- | --- |\n| Esc | 노멀 모드 |";
        fs::write(&src, content).unwrap();
        let n = s.import_markdown_file(&src).unwrap();
        assert_eq!(n.body, content);
        assert_eq!(s.load(&n.meta.id).unwrap().body, content, "디스크에도 저장");
        assert!(src.exists(), "원본 파일은 건드리지 않는다");
    }

    #[test]
    fn import_markdown_missing_or_binary_creates_nothing() {
        let (_d, s) = store();
        assert!(s
            .import_markdown_file(Path::new("/no/such/file.md"))
            .is_err());
        // UTF-8이 아닌 파일은 읽기에서 실패하고 노트가 생기지 않는다
        let bin = _d.path().join("image.md");
        fs::write(&bin, [0xff, 0xfe, 0x00, 0x80]).unwrap();
        assert!(s.import_markdown_file(&bin).is_err());
        assert!(s.list().is_empty(), "실패 시 빈 노트를 남기지 않는다");
    }

    #[test]
    fn own_writes_are_not_external_changes() {
        // 자기 쓰기(생성·본문·메타·병합의 내부 다단계 쓰기)는 감지 대상이 아니다
        let (_d, s) = store();
        let n = s.create().unwrap();
        s.save_body(&n.meta.id, "본문").unwrap();
        s.save_meta(
            &n.meta.id,
            &MetaPatch {
                color: Some("blue".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let t = s.create().unwrap();
        s.merge_note_groups(&n.meta.id, &t.meta.id).unwrap();
        assert!(s.external_changes().is_empty());
    }

    #[test]
    fn direct_file_write_is_detected_once() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        assert!(s.external_changes().is_empty());
        std::thread::sleep(std::time::Duration::from_millis(20)); // mtime 구분
        fs::write(
            s.notes_dir().join(format!("{}.md", n.meta.id)),
            format!("---\nid: {}\n---\n외부 수정", n.meta.id),
        )
        .unwrap();
        assert_eq!(
            s.external_changes(),
            vec![ExternalChange::Changed(n.meta.id.clone())]
        );
        assert!(s.external_changes().is_empty(), "같은 변경은 한 번만");
    }

    #[test]
    fn external_new_and_removed_files_are_detected() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        let _ = s.external_changes();
        fs::write(s.notes_dir().join("29990101-000001-abcdef.md"), "새 파일").unwrap();
        fs::remove_file(s.notes_dir().join(format!("{}.md", n.meta.id))).unwrap();
        let mut ch = s.external_changes();
        ch.sort_by_key(|c| format!("{c:?}"));
        assert_eq!(
            ch,
            vec![
                ExternalChange::Changed("29990101-000001-abcdef".into()),
                ExternalChange::Removed(n.meta.id.clone()),
            ]
        );
    }

    #[test]
    fn startup_baseline_reports_no_changes() {
        // 재시작 직후 기존 파일들이 전부 "외부 변경"으로 쏟아지면 안 된다
        let d = TempDir::new().unwrap();
        {
            let s = Store::new(d.path()).unwrap();
            s.create().unwrap();
        }
        let s2 = Store::new(d.path()).unwrap();
        assert!(s2.external_changes().is_empty());
    }

    #[test]
    fn note_file_returns_real_path_or_not_found() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        let p = s.note_file(&n.meta.id).unwrap();
        assert!(p.is_file());
        assert!(p.ends_with(format!("{}.md", n.meta.id)));
        assert!(matches!(
            s.note_file("20990101-000000-abcdef"),
            Err(Error::NoteNotFound)
        ));
        assert!(matches!(s.note_file("../evil"), Err(Error::Invalid(_))));
    }

    #[test]
    fn list_ignores_non_md_files() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        fs::write(s.notes_dir().join("readme.txt"), "노트 아님").unwrap();
        fs::write(s.notes_dir().join("ghost.md.12345.tmp"), "남은 임시 파일").unwrap();
        let list = s.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].meta.id, n.meta.id);
    }

    #[test]
    fn title_patch_set_and_clear() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        s.save_meta(
            &n.meta.id,
            &MetaPatch {
                title: Some("회의록".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            s.load(&n.meta.id).unwrap().meta.title.as_deref(),
            Some("회의록")
        );
        s.save_meta(
            &n.meta.id,
            &MetaPatch {
                title: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.load(&n.meta.id).unwrap().meta.title, None);
    }

    #[test]
    fn empty_group_patch_clears_group() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        s.save_meta(
            &n.meta.id,
            &MetaPatch {
                group: Some("업무".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            s.load(&n.meta.id).unwrap().meta.group.as_deref(),
            Some("업무")
        );
        s.save_meta(
            &n.meta.id,
            &MetaPatch {
                group: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.load(&n.meta.id).unwrap().meta.group, None);
    }

    #[test]
    fn assigning_group_auto_appends_order() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        let b = s.create().unwrap();
        let c = s.create().unwrap();
        for id in [&a.meta.id, &b.meta.id, &c.meta.id] {
            s.save_meta(
                id,
                &MetaPatch {
                    group: Some("모음".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        let g = s.group_notes("모음");
        assert_eq!(g.len(), 3);
        let orders: Vec<u32> = g.iter().map(|n| n.meta.group_order).collect();
        assert!(
            orders[0] < orders[1] && orders[1] < orders[2],
            "부여 순서대로 정렬: {:?}",
            orders
        );
        assert_eq!(g[0].meta.id, a.meta.id);
        assert_eq!(s.group_names(), vec!["모음".to_string()]);
    }

    #[test]
    fn settings_without_favorite_fonts_defaults_empty() {
        // 기존 settings.json(구 버전)에 favorite_fonts가 없어도 로드된다
        let d = TempDir::new().unwrap();
        fs::write(
            d.path().join("settings.json"),
            r#"{"default_color":"pink"}"#,
        )
        .unwrap();
        let s = Store::new(d.path()).unwrap();
        assert_eq!(s.settings().default_color, "pink");
        assert!(s.settings().favorite_fonts.is_empty());
        assert_eq!(s.settings().theme, "system");
    }

    #[test]
    fn corrupt_settings_file_falls_back_to_defaults() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("settings.json"), "{broken").unwrap();
        let s = Store::new(d.path()).unwrap();
        assert_eq!(s.settings().default_color, "yellow");
    }

    #[test]
    fn create_load_roundtrip() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        let loaded = s.load(&n.meta.id).unwrap();
        assert_eq!(loaded, n);
    }

    #[test]
    fn save_body_bumps_updated_at_and_persists() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let n2 = s.save_body(&n.meta.id, "새 본문").unwrap();
        assert_eq!(n2.body, "새 본문");
        assert!(n2.meta.updated_at > n.meta.updated_at);
        assert_eq!(s.load(&n.meta.id).unwrap().body, "새 본문");
    }

    #[test]
    fn save_meta_partial_does_not_bump_updated_at() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        let patch = MetaPatch {
            color: Some("blue".into()),
            font_size: Some(22),
            ..Default::default()
        };
        let n2 = s.save_meta(&n.meta.id, &patch).unwrap();
        assert_eq!(n2.meta.color, "blue");
        assert_eq!(n2.meta.font_size, 22);
        assert_eq!(n2.meta.updated_at, n.meta.updated_at);
        assert!(!n2.meta.hidden, "미지정 필드 유지");
    }

    #[test]
    fn list_sorted_by_updated_at_desc() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = s.create().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        s.save_body(&a.meta.id, "수정").unwrap();
        let ids: Vec<String> = s.list().into_iter().map(|n| n.meta.id).collect();
        assert_eq!(ids, vec![a.meta.id.clone(), b.meta.id.clone()]);
    }

    #[test]
    fn atomic_write_leaves_no_tmp_files() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        s.save_body(&n.meta.id, "x").unwrap();
        let leftovers: Vec<_> = std::fs::read_dir(s.notes_dir())
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .path()
                    .extension()
                    .map(|x| x == "tmp")
                    .unwrap_or(false)
            })
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn delete_removes_note_and_assets() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        let rel = s.save_asset(&n.meta.id, "png", b"fakepng").unwrap();
        assert!(rel.starts_with(&format!("assets/{}/", n.meta.id)));
        s.delete(&n.meta.id).unwrap();
        assert!(s.load(&n.meta.id).is_none());
        assert!(!_d.path().join("assets").join(&n.meta.id).exists());
    }

    #[test]
    fn save_asset_writes_bytes() {
        let (_d, s) = store();
        let n = s.create().unwrap();
        let rel = s.save_asset(&n.meta.id, "png", b"bytes!").unwrap();
        assert_eq!(std::fs::read(_d.path().join(&rel)).unwrap(), b"bytes!");
    }

    #[test]
    fn rejects_path_traversal_ids() {
        let (_d, s) = store();

        // save_body should reject traversal ids
        assert!(s.save_body("../evil", "body").is_err());
        assert!(s.save_body("../../etc", "body").is_err());
        assert!(s.save_body("a/b/c", "body").is_err());

        // delete should reject traversal ids
        assert!(s.delete("../evil").is_err());
        assert!(s.delete("a/b").is_err());

        // save_meta should reject traversal ids
        let patch = MetaPatch {
            color: Some("red".into()),
            ..Default::default()
        };
        assert!(s.save_meta("../evil", &patch).is_err());

        // save_asset should reject traversal note_ids
        assert!(s.save_asset("../evil", "png", b"data").is_err());
        assert!(s.save_asset("a/b", "png", b"data").is_err());

        // load should return None for traversal ids (not error)
        assert!(s.load("../evil").is_none());
        assert!(s.load("a/b/c").is_none());

        // Verify no files created outside store root
        let root_entries: Vec<_> = fs::read_dir(_d.path()).unwrap().collect();
        for entry in root_entries {
            let path = entry.unwrap().path();
            if path.is_dir() {
                assert!(
                    path.file_name().unwrap() == "notes" || path.file_name().unwrap() == "assets"
                );
            }
        }
    }

    #[test]
    fn rejects_bad_asset_ext() {
        let (_d, s) = store();
        let n = s.create().unwrap();

        // reject path traversal in ext
        assert!(s.save_asset(&n.meta.id, "../x", b"data").is_err());
        assert!(s.save_asset(&n.meta.id, "a/b", b"data").is_err());
        assert!(s.save_asset(&n.meta.id, "..", b"data").is_err());
        assert!(s.save_asset(&n.meta.id, ".", b"data").is_err());

        // reject non-alphanumeric
        assert!(s.save_asset(&n.meta.id, "p@ng", b"data").is_err());
        assert!(s.save_asset(&n.meta.id, "p!g", b"data").is_err());
        assert!(s.save_asset(&n.meta.id, "p-ng", b"data").is_err());

        // reject too long or empty
        assert!(s.save_asset(&n.meta.id, "", b"data").is_err());
        assert!(s.save_asset(&n.meta.id, "verylongext", b"data").is_err());

        // accept valid extensions
        assert!(s.save_asset(&n.meta.id, "png", b"data").is_ok());
        assert!(s.save_asset(&n.meta.id, "jpg", b"data").is_ok());
        assert!(s.save_asset(&n.meta.id, "txt", b"data").is_ok());
        assert!(s.save_asset(&n.meta.id, "a", b"data").is_ok());
        assert!(s.save_asset(&n.meta.id, "abcde", b"data").is_ok());
    }

    #[test]
    fn load_persists_recovered_frontmatter_across_reads() {
        let (_d, s) = store();
        let id = uuid::Uuid::now_v7().to_string();
        let path = s.notes_dir().join(format!("{id}.md"));
        fs::write(&path, "---\ncolor: [broken yaml\n---\n본문 유지").unwrap();

        // First load recovers with a synthesized default meta.
        let first = s.load(&id).unwrap();
        assert_eq!(first.meta.color, "yellow");
        assert_eq!(first.body, "본문 유지");

        // (a) Second load must return the SAME meta (same updated_at) —
        // proves the recovered meta was written back, not re-synthesized.
        let second = s.load(&id).unwrap();
        assert_eq!(second.meta, first.meta);

        // (b) The file on disk now round-trips cleanly with no further
        // recovery needed.
        let raw = fs::read_to_string(&path).unwrap();
        let (reparsed, recovered) = Note::from_file_string(&id, &raw);
        assert!(!recovered);
        assert_eq!(reparsed.meta, first.meta);
        assert_eq!(reparsed.body, "본문 유지");
    }

    #[test]
    fn list_persists_recovered_frontmatter_stable_across_polls() {
        let (_d, s) = store();
        let id = uuid::Uuid::now_v7().to_string();
        let path = s.notes_dir().join(format!("{id}.md"));
        // No frontmatter at all — also triggers recovery.
        fs::write(&path, "프론트매터 없는 파일").unwrap();

        let first = s.list();
        assert_eq!(first.len(), 1);
        let updated_at_1 = first[0].meta.updated_at.clone();
        assert!(!first[0].meta.hidden);

        std::thread::sleep(std::time::Duration::from_millis(5));

        // A second poll (as the 2s frontend timer would do) must not
        // regenerate updated_at — otherwise the note stays pinned to the
        // top of the sorted list forever.
        let second = s.list();
        let updated_at_2 = second[0].meta.updated_at.clone();
        assert_eq!(updated_at_1, updated_at_2);

        // The file on disk is now clean frontmatter.
        let raw = fs::read_to_string(&path).unwrap();
        let (_, recovered) = Note::from_file_string(&id, &raw);
        assert!(!recovered);
    }
}
