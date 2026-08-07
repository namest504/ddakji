//! 노트·설정 데이터 모델과 파일 표현(프론트매터) 직렬화.
//!
//! 이 모듈은 순수하다 — 파일 시스템에 접근하지 않는다.

use serde::{Deserialize, Serialize};


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
    /// 사용자 지정 제목 — None이면 본문 첫 줄에서 파생
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// 모음집(그룹) 이름 — None이면 무소속 (#25)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    /// 그룹 내 순서 (오름차순)
    #[serde(default)]
    pub group_order: u32,
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
            title: None,
            group: None,
            group_order: 0,
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
    /// 빈 문자열 = 제목 해제(본문 파생으로 복귀)
    pub title: Option<String>,
    /// 빈 문자열 = 그룹 해제
    pub group: Option<String>,
    pub group_order: Option<u32>,
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
    /// "system" | "light" | "dark" — system은 OS 설정 추종
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_theme() -> String {
    "system".into()
}

/// 새 모음집 자동 이름 — "새 그룹 {번호}" 순번
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

impl Default for Settings {
    fn default() -> Self {
        Settings {
            default_color: default_color(),
            default_font_family: default_font_family(),
            default_font_size: default_font_size(),
            favorite_fonts: Vec::new(),
            theme: default_theme(),
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn body_with_horizontal_rule_roundtrips() {
        // 본문의 마크다운 구분선(---)이 프론트매터 종료로 오인되면 본문이 잘린다
        let meta = NoteMeta::new_default("hr-1".into());
        let body = "위 문단\n\n---\n\n아래 문단";
        let note = Note { meta, body: body.into() };
        let (parsed, recovered) = Note::from_file_string("hr-1", &note.to_file_string());
        assert!(!recovered);
        assert_eq!(parsed.body, body);
    }

    #[test]
    fn group_fields_default_and_backcompat() {
        let (parsed, _) = Note::from_file_string("abc", "---\nid: abc\n---\n본문");
        assert_eq!(parsed.meta.group, None);
        assert_eq!(parsed.meta.group_order, 0);
    }

    #[test]
    fn next_new_group_name_fills_gaps() {
        assert_eq!(next_new_group_name(&["새 그룹 2".into(), "새 그룹 3".into()]), "새 그룹 1");
        assert_eq!(next_new_group_name(&["새 그룹 1".into(), "새 그룹 3".into()]), "새 그룹 2");
    }
}
