//! 실행 인자 프로토콜 (#12 3단계) — CLI가 두 번째 실행(single-instance argv)
//! 으로 실행 중인 앱에 전달하는 액션. 현재는 `--open <노트 id>` 하나다.
//! 앱이 꺼져 있으면 콜드 스타트의 setup이 같은 인자를 처리한다.

/// `--open <id>`의 id — 없거나 값이 빠졌으면 None
pub fn open_arg(args: &[String]) -> Option<&str> {
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if a == "--open" {
            return it.next().map(|s| s.as_str());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_open_id_after_exe_path() {
        assert_eq!(
            open_arg(&v(&["ddakji.exe", "--open", "20260810-1-a"])),
            Some("20260810-1-a")
        );
    }

    #[test]
    fn missing_flag_or_value_is_none() {
        assert_eq!(open_arg(&v(&["ddakji.exe"])), None);
        assert_eq!(open_arg(&v(&["ddakji.exe", "--open"])), None);
    }
}
