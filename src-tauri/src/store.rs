use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct NoteMeta {
    pub id: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default)]
    pub viewer_mode: bool,
    #[serde(default = "default_window")]
    pub window: WindowBounds,
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default)]
    pub hidden: bool,
}

fn default_color() -> String {
    "yellow".into()
}

fn default_font_size() -> u32 {
    16
}

fn default_font_family() -> String {
    // 의미 키("system" | "serif" | "mono") — 실제 폰트 스택 매핑은 프런트가 담당
    "system".into()
}

fn default_window() -> WindowBounds {
    WindowBounds {
        x: 100.0,
        y: 100.0,
        w: 320.0,
        h: 340.0,
    }
}

impl NoteMeta {
    pub fn new_default(id: String) -> Self {
        let now = chrono::Local::now().to_rfc3339();
        NoteMeta {
            id,
            created_at: now.clone(),
            updated_at: now,
            color: default_color(),
            font_size: default_font_size(),
            font_family: default_font_family(),
            viewer_mode: false,
            window: default_window(),
            always_on_top: false,
            hidden: false,
        }
    }
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct MetaPatch {
    pub color: Option<String>,
    pub font_size: Option<u32>,
    pub font_family: Option<String>,
    pub viewer_mode: Option<bool>,
    pub always_on_top: Option<bool>,
    pub hidden: Option<bool>,
    pub window: Option<WindowBounds>,
}

/// 새 노트에 적용될 기본값. `settings.json`(데이터 루트)에 저장된다.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Settings {
    #[serde(default = "default_color")]
    pub default_color: String,
    #[serde(default = "default_font_family")]
    pub default_font_family: String,
    #[serde(default = "default_font_size")]
    pub default_font_size: u32,
    /// 자주 쓰는 폰트 (노트 툴바 팝오버에 프리셋과 함께 노출)
    #[serde(default)]
    pub favorite_fonts: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            default_color: default_color(),
            default_font_family: default_font_family(),
            default_font_size: default_font_size(),
            favorite_fonts: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Note {
    pub meta: NoteMeta,
    pub body: String,
}

impl Note {
    pub fn to_file_string(&self) -> String {
        let yaml = serde_yaml::to_string(&self.meta).expect("meta serializes");
        format!("---\n{yaml}---\n{}", self.body)
    }

    /// Parses `content` (raw file text) into a `Note`.
    ///
    /// Returns `(note, recovered)`: `recovered` is `true` when the frontmatter
    /// was missing or corrupt and `NoteMeta::new_default` had to be synthesized
    /// as a fallback. Callers that persist notes (`Store::load`/`Store::list`)
    /// use this flag to write the recovered meta back to disk once, so a
    /// fresh `updated_at`/`hidden` is not re-synthesized on every read.
    ///
    /// This function stays pure (no I/O) — recovery persistence is the
    /// caller's responsibility.
    pub fn from_file_string(id: &str, content: &str) -> (Note, bool) {
        if let Some(rest) = content.strip_prefix("---\n") {
            // Try to find closing delimiter with newline: \n---\n
            if let Some(end) = rest.find("\n---\n") {
                let (yaml, body) = (&rest[..end], &rest[end + 5..]);
                if let Ok(mut meta) = serde_yaml::from_str::<NoteMeta>(yaml) {
                    meta.id = id.to_string(); // 파일명이 진실
                    return (
                        Note {
                            meta,
                            body: body.to_string(),
                        },
                        false,
                    );
                }
                // 프론트매터 손상: 본문만 보존
                return (
                    Note {
                        meta: NoteMeta::new_default(id.into()),
                        body: body.to_string(),
                    },
                    true,
                );
            }
            // Try closing delimiter at EOF (no trailing newline): \n---
            if rest.ends_with("\n---") {
                let end = rest.len() - 4; // length of "\n---"
                let yaml = &rest[..end];
                if let Ok(mut meta) = serde_yaml::from_str::<NoteMeta>(yaml) {
                    meta.id = id.to_string();
                    return (
                        Note {
                            meta,
                            body: String::new(),
                        },
                        false,
                    );
                }
                // 프론트매터 손상: 본문은 비어있음
                return (
                    Note {
                        meta: NoteMeta::new_default(id.into()),
                        body: String::new(),
                    },
                    true,
                );
            }
        }
        (
            Note {
                meta: NoteMeta::new_default(id.into()),
                body: content.to_string(),
            },
            true,
        )
    }
}

pub struct Store {
    root: PathBuf,
    settings: Settings,
}

fn validate_id(id: &str) -> io::Result<()> {
    // Validate id as a valid UUID to prevent path traversal
    if uuid::Uuid::parse_str(id).is_ok() {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "id must be a valid UUID",
        ))
    }
}

fn validate_ext(ext: &str) -> io::Result<()> {
    // Validate ext as ASCII-alphanumeric only, length 1..=5
    if ext.is_empty() || ext.len() > 5 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "ext must be 1..=5 characters",
        ));
    }
    if !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "ext must contain only ASCII alphanumeric characters",
        ));
    }
    Ok(())
}

impl Store {
    pub fn new(root: &Path) -> io::Result<Store> {
        fs::create_dir_all(root.join("notes"))?;
        fs::create_dir_all(root.join("assets"))?;
        // settings.json이 없거나 파손이면 기본값 — 노트 접근을 막지 않는다
        let settings = fs::read_to_string(root.join("settings.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Ok(Store {
            root: root.to_path_buf(),
            settings,
        })
    }

    pub fn settings(&self) -> Settings {
        self.settings.clone()
    }

    pub fn set_settings(&mut self, s: &Settings) -> io::Result<()> {
        let path = self.root.join("settings.json");
        let tmp = self.root.join(format!("settings.json.{}.tmp", uuid::Uuid::now_v7()));
        fs::write(&tmp, serde_json::to_string_pretty(s).expect("settings serialize"))?;
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

    fn write_atomic(&self, note: &Note) -> io::Result<()> {
        let path = self.note_path(&note.meta.id);
        // Use unique tmp name to avoid concurrent write conflicts
        let tmp_id = uuid::Uuid::now_v7().to_string();
        let tmp = path.with_extension(format!("md.{}.tmp", tmp_id));
        fs::write(&tmp, note.to_file_string())?;
        fs::rename(&tmp, &path)
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

    pub fn create(&self) -> io::Result<Note> {
        let id = uuid::Uuid::now_v7().to_string();
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

    pub fn save_body(&self, id: &str, body: &str) -> io::Result<Note> {
        validate_id(id)?;
        let mut note = self.load(id).ok_or(io::ErrorKind::NotFound)?;
        note.body = body.to_string();
        note.meta.updated_at = chrono::Local::now().to_rfc3339();
        self.write_atomic(&note)?;
        Ok(note)
    }

    pub fn save_meta(&self, id: &str, patch: &MetaPatch) -> io::Result<Note> {
        validate_id(id)?;
        let mut note = self.load(id).ok_or(io::ErrorKind::NotFound)?;
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
        self.write_atomic(&note)?;
        Ok(note)
    }

    pub fn delete(&self, id: &str) -> io::Result<()> {
        validate_id(id)?;
        fs::remove_file(self.note_path(id))?;
        let assets = self.root.join("assets").join(id);
        if assets.exists() {
            fs::remove_dir_all(assets)?;
        }
        Ok(())
    }

    pub fn save_asset(&self, note_id: &str, ext: &str, bytes: &[u8]) -> io::Result<String> {
        validate_id(note_id)?;
        validate_ext(ext)?;
        let dir = self.root.join("assets").join(note_id);
        fs::create_dir_all(&dir)?;
        let name = format!("{}.{}", uuid::Uuid::now_v7(), ext);
        fs::write(dir.join(&name), bytes)?;
        Ok(format!("assets/{note_id}/{name}"))
    }

    pub fn import_asset(&self, note_id: &str, src: &Path) -> io::Result<String> {
        validate_id(note_id)?;
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
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
    fn frontmatter_roundtrip() {
        let mut meta = NoteMeta::new_default("abc-123".into());
        meta.color = "pink".into();
        meta.font_size = 20;
        meta.viewer_mode = true;
        let note = Note {
            meta: meta.clone(),
            body: "# 제목\n본문 --- 대시 포함\n".into(),
        };
        let s = note.to_file_string();
        let (parsed, recovered) = Note::from_file_string("abc-123", &s);
        assert_eq!(parsed.meta, meta);
        assert_eq!(parsed.body, "# 제목\n본문 --- 대시 포함\n");
        assert!(!recovered);
    }

    #[test]
    fn corrupt_frontmatter_preserves_body_with_default_meta() {
        let content = "---\ncolor: [broken yaml\n---\n본문은 살아야 한다";
        let (parsed, recovered) = Note::from_file_string("id-1", content);
        assert_eq!(parsed.meta.id, "id-1");
        assert_eq!(parsed.meta.color, "yellow");
        assert_eq!(parsed.body, "본문은 살아야 한다");
        assert!(recovered);
    }

    #[test]
    fn no_frontmatter_treats_all_as_body() {
        let (parsed, recovered) = Note::from_file_string("id-2", "그냥 텍스트");
        assert_eq!(parsed.body, "그냥 텍스트");
        assert_eq!(parsed.meta.id, "id-2");
        assert!(recovered);
    }

    #[test]
    fn frontmatter_no_trailing_newline() {
        // File ends right after closing --- (no trailing newline)
        let content = "---\nid: abc-123\ncolor: blue\n---";
        let (parsed, recovered) = Note::from_file_string("abc-123", content);
        assert_eq!(parsed.meta.id, "abc-123");
        assert_eq!(parsed.meta.color, "blue");
        assert_eq!(parsed.body, "");
        assert!(!recovered);
    }

    #[test]
    fn corrupt_frontmatter_at_eof_no_trailing_newline() {
        // Corrupt YAML at EOF (no trailing newline after closing delimiter)
        let content = "---\ncolor: [broken yaml\n---";
        let (parsed, recovered) = Note::from_file_string("id-x", content);
        assert_eq!(parsed.meta.id, "id-x");
        assert_eq!(parsed.meta.color, "yellow");
        assert_eq!(parsed.body, "");
        assert!(recovered);
    }

    #[test]
    fn meta_without_font_family_defaults_to_system() {
        // v0.1 노트에는 font_family가 없다 — 하위호환 확인
        let content = "---\nid: abc\ncolor: blue\n---\n본문";
        let (parsed, recovered) = Note::from_file_string("abc", content);
        assert_eq!(parsed.meta.font_family, "system");
        assert!(!recovered);
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
    fn create_ids_are_time_sortable_uuidv7() {
        let (_d, s) = store();
        let a = s.create().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        let b = s.create().unwrap();
        assert_eq!(uuid::Uuid::parse_str(&a.meta.id).unwrap().get_version_num(), 7);
        assert!(a.meta.id < b.meta.id, "UUIDv7 파일명은 생성 시각순으로 정렬돼야 한다");
    }

    #[test]
    fn settings_without_favorite_fonts_defaults_empty() {
        // 기존 settings.json(구 버전)에 favorite_fonts가 없어도 로드된다
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("settings.json"), r#"{"default_color":"pink"}"#).unwrap();
        let s = Store::new(d.path()).unwrap();
        assert_eq!(s.settings().default_color, "pink");
        assert!(s.settings().favorite_fonts.is_empty());
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
        assert_eq!(n2.meta.hidden, false); // 미지정 필드 유지
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
                assert!(path.file_name().unwrap() == "notes" || path.file_name().unwrap() == "assets");
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
        assert_eq!(first[0].meta.hidden, false);

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
