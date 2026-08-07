//! 데이터 루트 결정·이사와 파일 이름 규칙.
//!
//! 저장소 레이아웃(`notes/`, `assets/`, `settings.json`)을 아는 유일한 곳으로,
//! 노트 내용은 다루지 않는다.

use std::fs;
use std::path::{Path, PathBuf};

use super::model::Note;
use crate::{Error, Result};

/// 노트 id 검증 — 경로 조작 방지: 영숫자와 '-'만 허용
/// (새 형식 `20260805-134024-a1b2c3`, 구형 UUID 모두 통과)
pub(super) fn validate_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if ok {
        Ok(())
    } else {
        Err(Error::Invalid("id must be alphanumeric/dash".into()))
    }
}

/// 새 노트/에셋 파일명: 사람이 읽는 생성시각 + 짧은 고유 접미사.
/// 폴더에서 이름 정렬 = 생성 순서가 되고, 시각이 눈에 바로 보인다.
pub(super) fn new_file_id() -> String {
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let suffix = &uuid::Uuid::new_v4().simple().to_string()[..6];
    format!("{ts}-{suffix}")
}

/// 데이터 루트 결정 (#저장 위치):
/// 1) `<식별자 폴더>/storage-path.txt`에 사용자 지정 경로가 있으면 그것
/// 2) 기본: `%APPDATA%/StickDown` — 없으면 만들고 기존 식별자 폴더의 데이터를 이사
/// 3) StickDown 폴더가 존재하는데 우리 데이터(notes/)가 아니면 충돌 — 기존 식별자 폴더 유지
pub fn resolve_data_root(id_dir: &Path) -> PathBuf {
    let ptr = id_dir.join("storage-path.txt");
    if let Ok(p) = fs::read_to_string(&ptr) {
        let p = PathBuf::from(p.trim());
        if !p.as_os_str().is_empty() && fs::create_dir_all(p.join("notes")).is_ok() {
            return p;
        }
    }
    let Some(roaming) = id_dir.parent() else {
        return id_dir.to_path_buf();
    };
    let std_dir = roaming.join("StickDown");
    if std_dir.join("notes").is_dir() {
        return std_dir; // 우리가 쓰던 폴더
    }
    if !std_dir.exists() {
        if fs::create_dir_all(&std_dir).is_ok() {
            for name in ["notes", "assets", "settings.json"] {
                let from = id_dir.join(name);
                if from.exists() {
                    let _ = move_entry(&from, &std_dir.join(name));
                }
            }
            return std_dir;
        }
        return id_dir.to_path_buf();
    }
    // StickDown이 있지만 다른 용도의 폴더 — 건드리지 않는다
    id_dir.to_path_buf()
}

/// 저장 위치 변경: 현재 루트의 데이터를 새 경로로 옮긴다 (같은 볼륨이면 rename,
/// 아니면 복사 후 삭제). 성공 시 포인터 파일에 새 경로를 기록한다.
pub fn move_storage(id_dir: &Path, current: &Path, new_root: &Path) -> Result<()> {
    fs::create_dir_all(new_root)?;
    if new_root != current {
        for name in ["notes", "assets", "settings.json"] {
            let from = current.join(name);
            let to = new_root.join(name);
            if from.exists() && !to.exists() {
                move_entry(&from, &to)?;
            }
        }
    }
    fs::write(
        id_dir.join("storage-path.txt"),
        new_root.to_string_lossy().as_bytes(),
    )?;
    Ok(())
}

fn move_entry(from: &Path, to: &Path) -> std::io::Result<()> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    // 볼륨이 다르면 rename이 실패한다 — 복사 후 원본 삭제
    if from.is_dir() {
        copy_dir(from, to)?;
        fs::remove_dir_all(from)
    } else {
        fs::copy(from, to)?;
        fs::remove_file(from)
    }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)?.flatten() {
        let dst = to.join(e.file_name());
        if e.path().is_dir() {
            copy_dir(&e.path(), &dst)?;
        } else {
            fs::copy(e.path(), &dst)?;
        }
    }
    Ok(())
}

/// 구형(UUID 파일명) 노트를 새 형식으로 개명한다 — 에셋 폴더와 본문의
/// assets/<id>/ 참조까지 함께. 시각은 프론트매터 created_at을 사용한다.
pub(super) fn migrate_uuid_filenames(root: &Path) {
    let notes_dir = root.join("notes");
    let Ok(rd) = fs::read_dir(&notes_dir) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().map(|x| x != "md").unwrap_or(true) {
            continue;
        }
        let Some(stem) = p.file_stem().and_then(|s| s.to_str()).map(String::from) else {
            continue;
        };
        if uuid::Uuid::parse_str(&stem).is_err() {
            continue; // 이미 새 형식
        }
        let ts = fs::read_to_string(&p)
            .ok()
            .map(|c| Note::from_file_string(&stem, &c).0.meta.created_at)
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.format("%Y%m%d-%H%M%S").to_string())
            .unwrap_or_else(|| chrono::Local::now().format("%Y%m%d-%H%M%S").to_string());
        let suffix = &uuid::Uuid::new_v4().simple().to_string()[..6];
        let new_id = format!("{ts}-{suffix}");
        let new_path = notes_dir.join(format!("{new_id}.md"));
        if fs::rename(&p, &new_path).is_err() {
            continue;
        }
        let assets_old = root.join("assets").join(&stem);
        if assets_old.exists() {
            let _ = fs::rename(assets_old, root.join("assets").join(&new_id));
        }
        if let Ok(c) = fs::read_to_string(&new_path) {
            let c2 = c.replace(&format!("assets/{stem}/"), &format!("assets/{new_id}/"));
            if c2 != c {
                let _ = fs::write(&new_path, c2);
            }
        }
    }
}

/// 에셋 확장자 검증 — ASCII 영숫자 1~5자 (경로 조작·이중 확장자 차단)
pub(super) fn validate_ext(ext: &str) -> Result<()> {
    if ext.is_empty() || ext.len() > 5 {
        return Err(Error::Invalid("ext must be 1..=5 characters".into()));
    }
    if !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(Error::Invalid(
            "ext must contain only ASCII alphanumeric characters".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn resolves_default_stickdown_dir_and_migrates() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.stickdown.app");
        fs::create_dir_all(id_dir.join("notes")).unwrap();
        fs::write(id_dir.join("notes").join("a.md"), "x").unwrap();
        fs::write(id_dir.join("settings.json"), "{}").unwrap();
        let root = resolve_data_root(&id_dir);
        assert_eq!(root, base.path().join("StickDown"));
        assert!(root.join("notes").join("a.md").exists(), "데이터 이사");
        assert!(!id_dir.join("notes").exists(), "원본 정리");
    }

    #[test]
    fn conflicting_stickdown_dir_falls_back_to_id_dir() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.stickdown.app");
        fs::create_dir_all(&id_dir).unwrap();
        // notes/ 없는 남의 StickDown 폴더
        fs::create_dir_all(base.path().join("StickDown").join("other")).unwrap();
        assert_eq!(resolve_data_root(&id_dir), id_dir);
    }

    #[test]
    fn storage_pointer_file_overrides_default() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.stickdown.app");
        fs::create_dir_all(&id_dir).unwrap();
        let custom = base.path().join("custom");
        fs::write(
            id_dir.join("storage-path.txt"),
            custom.to_string_lossy().as_bytes(),
        )
        .unwrap();
        assert_eq!(resolve_data_root(&id_dir), custom);
        assert!(custom.join("notes").is_dir());
    }

    #[test]
    fn move_storage_relocates_and_writes_pointer() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.stickdown.app");
        let cur = base.path().join("StickDown");
        fs::create_dir_all(cur.join("notes")).unwrap();
        fs::write(cur.join("notes").join("a.md"), "x").unwrap();
        fs::create_dir_all(&id_dir).unwrap();
        let newp = base.path().join("elsewhere");
        move_storage(&id_dir, &cur, &newp).unwrap();
        assert!(newp.join("notes").join("a.md").exists());
        assert_eq!(
            fs::read_to_string(id_dir.join("storage-path.txt"))
                .unwrap()
                .trim(),
            newp.to_string_lossy()
        );
    }
}
