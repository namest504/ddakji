//! 데이터 루트 결정·이사와 파일 이름 규칙.
//!
//! 저장소 레이아웃(`notes/`, `assets/`, `settings.json`)을 아는 유일한 곳으로,
//! 노트 내용은 다루지 않는다.

use std::fs;
use std::path::{Path, PathBuf};

use crate::{Error, Result};

/// 노트 id 검증 — 경로 조작 방지: 영숫자와 '-'만 허용
/// (예: `20260805-134024-a1b2c3`)
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

/// 앱과 동일한 규칙의 기본 데이터 루트 — CLI·MCP 등 별도 바이너리용.
/// 식별자 폴더(`com.ddakji.app`)의 포인터 파일까지 그대로 따른다.
pub fn default_data_root() -> Option<PathBuf> {
    let id_dir = dirs::data_dir()?.join("com.ddakji.app");
    Some(resolve_data_root(&id_dir))
}

/// 기본 데이터 폴더 이름 (roaming 바로 아래)
const DATA_DIR_NAME: &str = "Ddakji";

/// 데이터 루트 결정 (#저장 위치):
/// 1) `<식별자 폴더>/storage-path.txt`에 사용자 지정 경로가 있으면 그것
/// 2) 기본: `%APPDATA%/Ddakji` — 없으면 만든다
/// 3) Ddakji 폴더가 존재하는데 우리 데이터(notes/)가 아니면 충돌 — 식별자 폴더 유지
pub fn resolve_data_root(id_dir: &Path) -> PathBuf {
    if let Some(p) = read_pointer(id_dir) {
        return p;
    }
    let Some(roaming) = id_dir.parent() else {
        return id_dir.to_path_buf();
    };
    let data_dir = roaming.join(DATA_DIR_NAME);
    if data_dir.join("notes").is_dir() {
        return data_dir; // 우리가 쓰던 폴더
    }
    if !data_dir.exists() {
        if fs::create_dir_all(&data_dir).is_ok() {
            return data_dir;
        }
        return id_dir.to_path_buf();
    }
    // Ddakji가 있지만 다른 용도의 폴더 — 건드리지 않는다
    id_dir.to_path_buf()
}

/// storage-path.txt가 가리키는 사용자 지정 경로 — 유효할 때만 Some
fn read_pointer(id_dir: &Path) -> Option<PathBuf> {
    let raw = fs::read_to_string(id_dir.join("storage-path.txt")).ok()?;
    let p = PathBuf::from(raw.trim());
    if !p.as_os_str().is_empty() && fs::create_dir_all(p.join("notes")).is_ok() {
        Some(p)
    } else {
        None
    }
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
    fn creates_default_dir_next_to_id_dir() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.ddakji.app");
        fs::create_dir_all(&id_dir).unwrap();
        let root = resolve_data_root(&id_dir);
        assert_eq!(root, base.path().join("Ddakji"));
        assert!(root.is_dir());
    }

    #[test]
    fn conflicting_data_dir_falls_back_to_id_dir() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.ddakji.app");
        fs::create_dir_all(&id_dir).unwrap();
        // notes/ 없는 남의 Ddakji 폴더
        fs::create_dir_all(base.path().join("Ddakji").join("other")).unwrap();
        assert_eq!(resolve_data_root(&id_dir), id_dir);
    }

    #[test]
    fn storage_pointer_file_overrides_default() {
        let base = TempDir::new().unwrap();
        let id_dir = base.path().join("com.ddakji.app");
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
        let id_dir = base.path().join("com.ddakji.app");
        let cur = base.path().join("Ddakji");
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
