//! 앱 전역 에러 타입.
//!
//! 커맨드가 이 타입을 반환하면 Tauri가 프런트로 **문자열**로 직렬화한다.
//! 프런트는 오직 `NOTE_NOT_FOUND` 하나만 프로그램적으로 구분하고(밖에서 삭제된
//! 노트의 좀비 창을 닫는 용도), 나머지는 사람이 읽는 메시지로 취급한다.
//! 따라서 `Display` 문자열이 곧 프런트와의 계약이다.

use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// 노트 파일이 없다 — 프런트가 이 마커를 보고 창을 닫는다.
    /// 문자열을 바꾸면 프런트의 `closeIfGone`이 깨진다.
    #[error("NOTE_NOT_FOUND")]
    NoteNotFound,

    /// 창이 어떤 노트를 표시 중인지 매핑에 없다 (그룹 내비·병합의 전제)
    #[error("창에 연결된 노트가 없습니다")]
    WindowNotMapped,

    /// 노트 id·확장자·경로 등 입력값이 규칙을 벗어남 (경로 조작 차단 포함)
    #[error("{0}")]
    Invalid(String),

    /// 다른 스레드가 패닉해 상태 잠금이 손상됨
    #[error("내부 상태가 손상되었습니다")]
    Poisoned,

    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),

    /// 외부 연동 실패 (탐색기로 폴더 열기 등)
    #[error("{0}")]
    External(String),
}

impl Error {
    /// io 에러를 "노트가 없음"과 그 외로 가른다. 노트 파일을 직접 다루는
    /// 경로에서만 쓴다 — 사용자가 고른 외부 파일에는 쓰지 않는다.
    pub fn note_io(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            Error::NoteNotFound
        } else {
            Error::Io(e)
        }
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_not_found_keeps_the_frontend_marker() {
        // 프런트(closeIfGone)가 문자열 비교로 의존하는 계약
        assert_eq!(Error::NoteNotFound.to_string(), "NOTE_NOT_FOUND");
        assert_eq!(
            serde_json::to_string(&Error::NoteNotFound).unwrap(),
            "\"NOTE_NOT_FOUND\""
        );
    }

    #[test]
    fn note_io_maps_only_missing_files_to_the_marker() {
        let missing = std::io::Error::new(std::io::ErrorKind::NotFound, "x");
        assert!(matches!(Error::note_io(missing), Error::NoteNotFound));
        let denied = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        assert!(matches!(Error::note_io(denied), Error::Io(_)));
    }

    #[test]
    fn other_errors_serialize_as_readable_messages() {
        let e = Error::Invalid("id must be alphanumeric/dash".into());
        assert_eq!(e.to_string(), "id must be alphanumeric/dash");
        assert_ne!(e.to_string(), "NOTE_NOT_FOUND");
    }
}
