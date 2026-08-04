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
            viewer_mode: false,
            window: default_window(),
            always_on_top: false,
            hidden: false,
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

    pub fn from_file_string(id: &str, content: &str) -> Note {
        if let Some(rest) = content.strip_prefix("---\n") {
            // Try to find closing delimiter with newline: \n---\n
            if let Some(end) = rest.find("\n---\n") {
                let (yaml, body) = (&rest[..end], &rest[end + 5..]);
                if let Ok(mut meta) = serde_yaml::from_str::<NoteMeta>(yaml) {
                    meta.id = id.to_string(); // 파일명이 진실
                    return Note {
                        meta,
                        body: body.to_string(),
                    };
                }
                // 프론트매터 손상: 본문만 보존
                return Note {
                    meta: NoteMeta::new_default(id.into()),
                    body: body.to_string(),
                };
            }
            // Try closing delimiter at EOF (no trailing newline): \n---
            if rest.ends_with("\n---") {
                let end = rest.len() - 4; // length of "\n---"
                let yaml = &rest[..end];
                if let Ok(mut meta) = serde_yaml::from_str::<NoteMeta>(yaml) {
                    meta.id = id.to_string();
                    return Note {
                        meta,
                        body: String::new(),
                    };
                }
                // 프론트매터 손상: 본문은 비어있음
                return Note {
                    meta: NoteMeta::new_default(id.into()),
                    body: String::new(),
                };
            }
        }
        Note {
            meta: NoteMeta::new_default(id.into()),
            body: content.to_string(),
        }
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
        let parsed = Note::from_file_string("abc-123", &s);
        assert_eq!(parsed.meta, meta);
        assert_eq!(parsed.body, "# 제목\n본문 --- 대시 포함\n");
    }

    #[test]
    fn corrupt_frontmatter_preserves_body_with_default_meta() {
        let content = "---\ncolor: [broken yaml\n---\n본문은 살아야 한다";
        let parsed = Note::from_file_string("id-1", content);
        assert_eq!(parsed.meta.id, "id-1");
        assert_eq!(parsed.meta.color, "yellow");
        assert_eq!(parsed.body, "본문은 살아야 한다");
    }

    #[test]
    fn no_frontmatter_treats_all_as_body() {
        let parsed = Note::from_file_string("id-2", "그냥 텍스트");
        assert_eq!(parsed.body, "그냥 텍스트");
        assert_eq!(parsed.meta.id, "id-2");
    }

    #[test]
    fn frontmatter_no_trailing_newline() {
        // File ends right after closing --- (no trailing newline)
        let content = "---\nid: abc-123\ncolor: blue\n---";
        let parsed = Note::from_file_string("abc-123", content);
        assert_eq!(parsed.meta.id, "abc-123");
        assert_eq!(parsed.meta.color, "blue");
        assert_eq!(parsed.body, "");
    }

    #[test]
    fn corrupt_frontmatter_at_eof_no_trailing_newline() {
        // Corrupt YAML at EOF (no trailing newline after closing delimiter)
        let content = "---\ncolor: [broken yaml\n---";
        let parsed = Note::from_file_string("id-x", content);
        assert_eq!(parsed.meta.id, "id-x");
        assert_eq!(parsed.meta.color, "yellow");
        assert_eq!(parsed.body, "");
    }
}
