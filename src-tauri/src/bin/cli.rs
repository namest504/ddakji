//! ddakji-cli — AI·스크립트용 노트 조작 (#12).
//!
//! GUI와 같은 [`ddakji_lib::store::Store`]를 링크하므로 그룹 규칙(순서
//! 자동 부여·1명 남으면 자동 해제·통째 병합)이 CLI에서도 동일하게 적용된다.
//! 앱 실행 여부와 무관하게 동작한다 — 실행 중인 앱은 파일 변경을 감지해
//! 화면을 갱신한다(외부 변경 브리지, #12 2단계).

use std::io::Read;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

use ddakji_lib::store::{MetaPatch, Note, Store};

#[derive(Parser)]
#[command(
    name = "ddakji-cli",
    version,
    about = "ddakji 노트를 명령줄에서 다룹니다",
    after_help = "본문 인자 자리에 '-'를 주면 stdin에서 읽습니다.\n\
                  예) echo '# 회의' | ddakji-cli add -"
)]
struct Cli {
    /// 결과를 JSON으로 출력 (스크립트·AI 연동용)
    #[arg(long, global = true)]
    json: bool,

    /// 데이터 폴더를 직접 지정 (기본: 앱과 같은 위치)
    #[arg(long, global = true, value_name = "DIR")]
    data_dir: Option<PathBuf>,

    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// 노트 목록 (id · 모음집 · 첫 줄)
    List,
    /// 노트 하나의 본문 출력 (--json이면 메타 포함 전체)
    Get { id: String },
    /// 새 노트 생성 — 본문은 인자 또는 stdin('-')
    Add {
        /// 본문 텍스트, '-'면 stdin
        body: String,
        #[arg(long)]
        group: Option<String>,
        #[arg(long)]
        color: Option<String>,
        #[arg(long)]
        title: Option<String>,
    },
    /// 기존 노트 끝에 본문 덧붙이기
    Append {
        id: String,
        /// 덧붙일 텍스트, '-'면 stdin
        text: String,
    },
    /// 본문 전체 교체
    Edit {
        id: String,
        /// 새 본문, '-'면 stdin
        body: String,
    },
    /// 메타 변경 — 모음집·색·제목 (빈 문자열 = 해제)
    Set {
        id: String,
        /// 모음집 이름, ""면 모음집에서 제외
        #[arg(long)]
        group: Option<String>,
        #[arg(long)]
        color: Option<String>,
        /// 목록 표시용 제목, ""면 본문 파생으로 복귀
        #[arg(long)]
        title: Option<String>,
    },
    /// 노트 삭제 (모음집에 1명 남으면 자동 해제)
    Delete { id: String },
    /// 모음집 이름 목록
    Groups,
    /// moved 노트(와 그 모음집 전체)를 target의 모음집으로 통합
    Merge { moved: String, target: String },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let root = match cli.data_dir.clone().or_else(default_root) {
        Some(r) => r,
        None => {
            eprintln!("데이터 폴더를 찾을 수 없습니다 — --data-dir로 지정하세요");
            return ExitCode::FAILURE;
        }
    };
    let store = match Store::new(&root) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("저장소를 열 수 없습니다 ({}): {e}", root.display());
            return ExitCode::FAILURE;
        }
    };
    match run(&store, cli.cmd, cli.json) {
        Ok(out) => {
            if !out.is_empty() {
                println!("{out}");
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

/// 앱과 동일한 데이터 루트: `<데이터 폴더>/com.ddakji.app`을 식별자 폴더로
/// 하여 storage-path.txt 포인터와 기본 Ddakji 폴더 규칙을 그대로 따른다.
fn default_root() -> Option<PathBuf> {
    let id_dir = dirs::data_dir()?.join("com.ddakji.app");
    Some(ddakji_lib::store::resolve_data_root(&id_dir))
}

/// '-'는 stdin 전체로 치환 — AI 파이프라인의 기본 입력 경로
fn read_body(arg: String) -> Result<String, String> {
    if arg != "-" {
        return Ok(arg);
    }
    let mut buf = String::new();
    std::io::stdin()
        .read_to_string(&mut buf)
        .map_err(|e| format!("stdin 읽기 실패: {e}"))?;
    Ok(buf)
}

fn run(store: &Store, cmd: Cmd, json: bool) -> Result<String, String> {
    match cmd {
        Cmd::List => {
            let notes = store.list();
            if json {
                return to_json(&notes);
            }
            Ok(notes
                .iter()
                .map(|n| {
                    format!(
                        "{}\t{}\t{}",
                        n.meta.id,
                        n.meta.group.as_deref().unwrap_or("-"),
                        first_line(n)
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        Cmd::Get { id } => {
            let note = store.load(&id).ok_or("NOTE_NOT_FOUND")?;
            if json {
                to_json(&note)
            } else {
                Ok(note.body)
            }
        }
        Cmd::Add {
            body,
            group,
            color,
            title,
        } => {
            let body = read_body(body)?;
            let note = store.create().map_err(|e| e.to_string())?;
            let note = store
                .save_body(&note.meta.id, &body)
                .map_err(|e| e.to_string())?;
            let patch = MetaPatch {
                group,
                color,
                title,
                ..Default::default()
            };
            let note = apply_patch(store, &note.meta.id, patch)?.unwrap_or(note);
            if json {
                to_json(&note)
            } else {
                Ok(note.meta.id)
            }
        }
        Cmd::Append { id, text } => {
            let text = read_body(text)?;
            let note = store.load(&id).ok_or("NOTE_NOT_FOUND")?;
            let body = if note.body.is_empty() {
                text
            } else {
                format!("{}\n\n{}", note.body.trim_end_matches('\n'), text)
            };
            let note = store.save_body(&id, &body).map_err(|e| e.to_string())?;
            if json {
                to_json(&note)
            } else {
                Ok(String::new())
            }
        }
        Cmd::Edit { id, body } => {
            let body = read_body(body)?;
            let note = store.save_body(&id, &body).map_err(|e| e.to_string())?;
            if json {
                to_json(&note)
            } else {
                Ok(String::new())
            }
        }
        Cmd::Set {
            id,
            group,
            color,
            title,
        } => {
            if group.is_none() && color.is_none() && title.is_none() {
                return Err("바꿀 항목이 없습니다 — --group/--color/--title 중 하나 이상".into());
            }
            let patch = MetaPatch {
                group,
                color,
                title,
                ..Default::default()
            };
            let note = apply_patch(store, &id, patch)?.ok_or("NOTE_NOT_FOUND")?;
            if json {
                to_json(&note)
            } else {
                Ok(String::new())
            }
        }
        Cmd::Delete { id } => {
            store.delete(&id).map_err(|e| e.to_string())?;
            Ok(String::new())
        }
        Cmd::Groups => {
            let names = store.group_names();
            if json {
                to_json(&names)
            } else {
                Ok(names.join("\n"))
            }
        }
        Cmd::Merge { moved, target } => {
            let changed = store
                .merge_note_groups(&moved, &target)
                .map_err(|e| e.to_string())?;
            let group = store
                .load(&target)
                .and_then(|n| n.meta.group)
                .unwrap_or_default();
            if json {
                Ok(format!(
                    "{{\"changed\":{changed},\"group\":{}}}",
                    serde_json::to_string(&group).unwrap_or_else(|_| "\"\"".into())
                ))
            } else if changed {
                Ok(group)
            } else {
                Ok("이미 같은 모음집입니다".into())
            }
        }
    }
}

/// 패치에 내용이 있을 때만 저장 — Some(저장된 노트) / None(패치 비었음 아님, 실패)
fn apply_patch(store: &Store, id: &str, patch: MetaPatch) -> Result<Option<Note>, String> {
    let empty = patch.group.is_none() && patch.color.is_none() && patch.title.is_none();
    if empty {
        return Ok(store.load(id));
    }
    store
        .save_meta(id, &patch)
        .map(Some)
        .map_err(|e| e.to_string())
}

fn first_line(n: &Note) -> String {
    n.meta
        .title
        .clone()
        .or_else(|| {
            n.body
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty())
                .map(String::from)
        })
        .unwrap_or_default()
}

fn to_json<T: serde::Serialize>(v: &T) -> Result<String, String> {
    serde_json::to_string_pretty(v).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn store() -> (TempDir, Store) {
        let d = TempDir::new().unwrap();
        let s = Store::new(d.path()).unwrap();
        (d, s)
    }

    fn add(s: &Store, body: &str) -> String {
        run(
            s,
            Cmd::Add {
                body: body.into(),
                group: None,
                color: None,
                title: None,
            },
            false,
        )
        .unwrap()
    }

    #[test]
    fn add_then_get_roundtrip() {
        let (_d, s) = store();
        let id = add(&s, "# 회의록\n안건 정리");
        assert_eq!(
            run(&s, Cmd::Get { id: id.clone() }, false).unwrap(),
            "# 회의록\n안건 정리"
        );
        // JSON 출력은 메타 포함 전체
        let j = run(&s, Cmd::Get { id }, true).unwrap();
        assert!(j.contains("\"meta\""));
        assert!(j.contains("회의록"));
    }

    #[test]
    fn add_with_group_applies_store_rules() {
        // CLI도 GUI와 같은 Store 규칙 — 순서 자동 부여
        let (_d, s) = store();
        run(
            &s,
            Cmd::Add {
                body: "첫째".into(),
                group: Some("업무".into()),
                color: Some("blue".into()),
                title: None,
            },
            false,
        )
        .unwrap();
        run(
            &s,
            Cmd::Add {
                body: "둘째".into(),
                group: Some("업무".into()),
                color: None,
                title: None,
            },
            false,
        )
        .unwrap();
        let g = s.group_notes("업무");
        assert_eq!(g.len(), 2);
        assert!(g[0].meta.group_order < g[1].meta.group_order);
        assert_eq!(g[0].meta.color, "blue");
    }

    #[test]
    fn append_separates_with_blank_line() {
        let (_d, s) = store();
        let id = add(&s, "기존 내용");
        run(
            &s,
            Cmd::Append {
                id: id.clone(),
                text: "추가 내용".into(),
            },
            false,
        )
        .unwrap();
        assert_eq!(s.load(&id).unwrap().body, "기존 내용\n\n추가 내용");
    }

    #[test]
    fn set_group_clear_triggers_auto_dissolve() {
        // #77 룰3이 CLI 경로에서도 동작하는지 — 2명 중 1명 해제 → 모음집 소멸
        let (_d, s) = store();
        let a = add(&s, "하나");
        let b = add(&s, "둘");
        for id in [&a, &b] {
            run(
                &s,
                Cmd::Set {
                    id: id.clone(),
                    group: Some("둘이".into()),
                    color: None,
                    title: None,
                },
                false,
            )
            .unwrap();
        }
        run(
            &s,
            Cmd::Set {
                id: a,
                group: Some(String::new()),
                color: None,
                title: None,
            },
            false,
        )
        .unwrap();
        assert_eq!(s.load(&b).unwrap().meta.group, None, "CLI로도 자동 해제");
    }

    #[test]
    fn merge_via_cli_moves_whole_group() {
        let (_d, s) = store();
        let a = add(&s, "A1");
        let t = add(&s, "T");
        let out = run(
            &s,
            Cmd::Merge {
                moved: a.clone(),
                target: t.clone(),
            },
            false,
        )
        .unwrap();
        assert_eq!(out, "새 그룹 1");
        assert_eq!(s.load(&a).unwrap().meta.group.as_deref(), Some("새 그룹 1"));
    }

    #[test]
    fn get_missing_note_is_marked_error() {
        let (_d, s) = store();
        let e = run(
            &s,
            Cmd::Get {
                id: "20990101-000000-abcdef".into(),
            },
            false,
        )
        .unwrap_err();
        assert_eq!(e, "NOTE_NOT_FOUND");
    }

    #[test]
    fn list_shows_group_and_first_line() {
        let (_d, s) = store();
        let id = add(&s, "\n# 제목 줄\n본문");
        let out = run(&s, Cmd::List, false).unwrap();
        assert!(out.contains(&id));
        assert!(out.contains("# 제목 줄"));
        assert!(out.contains("\t-\t"), "무소속은 '-'");
    }
}
