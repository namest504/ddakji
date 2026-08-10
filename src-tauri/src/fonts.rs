//! 시스템 설치 폰트 열거 (#16 폰트 선택 UX).
//! Windows는 레지스트리 Fonts 키의 값 이름을 정제해 패밀리명을 얻는다.

/// 레지스트리 값 이름("Malgun Gothic (TrueType)", "Cascadia Code & Cascadia Mono (TrueType)")을
/// 폰트 패밀리명 목록으로 정제한다. 플랫폼 무관 순수 함수 — 테스트 대상.
pub fn parse_font_entry(value_name: &str) -> Vec<String> {
    let trimmed = value_name.trim();
    let base = match (trimmed.rfind(" ("), trimmed.ends_with(')')) {
        (Some(i), true) => &trimmed[..i],
        _ => trimmed,
    };
    base.split(" & ")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[cfg(windows)]
pub fn list_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut set = BTreeSet::new();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let key =
            RegKey::predef(hive).open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts");
        if let Ok(k) = key {
            for (name, _) in k.enum_values().flatten() {
                for f in parse_font_entry(&name) {
                    set.insert(f);
                }
            }
        }
    }
    set.into_iter().collect()
}

#[cfg(not(windows))]
pub fn list_system_fonts() -> Vec<String> {
    // 리눅스 개발 환경: fontconfig의 fc-list가 있으면 활용, 없으면 빈 목록
    use std::collections::BTreeSet;
    let mut set = BTreeSet::new();
    if let Ok(o) = std::process::Command::new("fc-list")
        .args([":", "family"])
        .output()
    {
        for line in String::from_utf8_lossy(&o.stdout).lines() {
            for fam in line.split(',') {
                let f = fam.trim();
                if !f.is_empty() {
                    set.insert(f.to_string());
                }
            }
        }
    }
    set.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_type_suffix() {
        assert_eq!(
            parse_font_entry("Malgun Gothic (TrueType)"),
            vec!["Malgun Gothic"]
        );
        assert_eq!(parse_font_entry("Batang (OpenType)"), vec!["Batang"]);
    }

    #[test]
    fn splits_family_groups() {
        assert_eq!(
            parse_font_entry("Cascadia Code & Cascadia Mono (TrueType)"),
            vec!["Cascadia Code", "Cascadia Mono"]
        );
    }

    #[test]
    fn plain_name_passes_through() {
        assert_eq!(parse_font_entry("D2Coding"), vec!["D2Coding"]);
    }
}
