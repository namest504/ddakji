//! 백엔드 지역화 (#143) — 트레이 메뉴처럼 Rust가 그리는 문자열만.
//! 사전이 클 이유가 없다: GUI 본문은 프런트 사전이, CLI·MCP는 영어가 담당.

/// 설정값("system"|"ko"|"en")을 실제 언어로 푼다. 판정 규칙은 프런트
/// (navigator.language)와 같아야 한다: ko로 시작하면 ko, 그 외 en.
pub fn resolve(setting: &str) -> Lang {
    match setting {
        "ko" => Lang::Ko,
        "en" => Lang::En,
        _ => {
            let sys = sys_locale::get_locale().unwrap_or_default();
            if sys.to_lowercase().starts_with("ko") {
                Lang::Ko
            } else {
                Lang::En
            }
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Lang {
    Ko,
    En,
}

/// 트레이 메뉴 문자열. 키를 늘릴 때 한쪽을 빼먹으면 컴파일 에러가 되도록
/// match 하나로 몰아 둔다.
pub fn tray(lang: Lang, key: &str) -> &'static str {
    match (lang, key) {
        (Lang::Ko, "new") => "새 노트",
        (Lang::En, "new") => "New note",
        (Lang::Ko, "list") => "노트 목록",
        (Lang::En, "list") => "Note list",
        (Lang::Ko, "show_all") => "모든 노트 표시",
        (Lang::En, "show_all") => "Show all notes",
        (Lang::Ko, "arrange") => "자동 정렬",
        (Lang::En, "arrange") => "Arrange windows",
        (Lang::Ko, "autostart") => "부팅 시 시작",
        (Lang::En, "autostart") => "Start at login",
        (Lang::Ko, "quit") => "종료",
        (Lang::En, "quit") => "Quit",
        _ => "?",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_settings_ignore_os_locale() {
        assert_eq!(resolve("ko"), Lang::Ko);
        assert_eq!(resolve("en"), Lang::En);
    }

    #[test]
    fn every_tray_key_has_both_languages() {
        for key in ["new", "list", "show_all", "arrange", "autostart", "quit"] {
            assert_ne!(tray(Lang::Ko, key), "?", "{key} ko 누락");
            assert_ne!(tray(Lang::En, key), "?", "{key} en 누락");
        }
    }
}
