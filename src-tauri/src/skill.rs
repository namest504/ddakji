//! AI 연동 자산 (#161) — 스킬 문서와 MCP 등록 설정.
//!
//! 전제: 사용자는 README를 읽지 않는다. 그래서 이 로직은 CLI 전용이 아니라
//! 앱(설정 화면)도 부를 수 있는 라이브러리다. 문서는 바이너리에 박혀 있어
//! 앱 버전과 함께 움직인다(#124의 사본 드리프트 재발 방지).

use std::path::{Path, PathBuf};

use crate::Result;

/// AI 에이전트용 사용 설명서 — 앱·CLI가 같은 사본을 공유한다.
pub const SKILL_MD: &str = include_str!("../../skills/ddakji/SKILL.md");

/// 스킬 루트 `~/.claude/skills` — HOME(유닉스)과 USERPROFILE(윈도우) 둘 다 본다.
pub fn default_skills_root() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| PathBuf::from(h).join(".claude").join("skills"))
}

/// `<root>/ddakji/SKILL.md`에 심는다(덮어쓴다 — 갱신이 존재 이유). 심은 경로 반환.
pub fn install_skill_to(root: &Path) -> Result<PathBuf> {
    let dir = root.join("ddakji");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("SKILL.md");
    std::fs::write(&path, SKILL_MD)?;
    Ok(path)
}

/// MCP 클라이언트(Claude Desktop 등)의 `mcpServers` 항목 — 그대로 붙여 넣게 들여쓴다.
pub fn mcp_client_config(mcp_exe: &Path) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "mcpServers": { "ddakji": { "command": mcp_exe.display().to_string() } }
    }))
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn installs_and_overwrites_under_root() {
        let d = TempDir::new().unwrap();
        let path = install_skill_to(d.path()).unwrap();
        assert!(path.ends_with("ddakji/SKILL.md") || path.ends_with("ddakji\\SKILL.md"));
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("name: ddakji"));

        // 낡은 사본 덮어쓰기 — 갱신이 이 함수의 존재 이유
        std::fs::write(&path, "stale").unwrap();
        install_skill_to(d.path()).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), SKILL_MD);
    }

    #[test]
    fn mcp_config_is_paste_ready() {
        let cfg = mcp_client_config(Path::new("C:\\x\\ddakji-mcp.exe"));
        let v: serde_json::Value = serde_json::from_str(&cfg).unwrap();
        assert_eq!(
            v["mcpServers"]["ddakji"]["command"],
            "C:\\x\\ddakji-mcp.exe"
        );
        assert!(cfg.contains('\n'));
    }
}
