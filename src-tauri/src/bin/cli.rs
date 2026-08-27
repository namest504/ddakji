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

/// AI 에이전트용 사용 설명서. **바이너리에 박아 둔다** — 스킬이 레포 밖에
/// 따로 살면 앱이 바뀌어도 따라오지 않는다(휴지통이 생긴 뒤에도 "되돌릴 수
/// 없다"고 적혀 있던 전례). 이렇게 두면 버전과 함께 움직인다.
const SKILL_MD: &str = include_str!("../../../skills/ddakji/SKILL.md");

#[derive(Parser)]
#[command(
    name = "ddakji-cli",
    version,
    about = "Manage ddakji notes from the command line",
    after_help = "Pass '-' in place of a body argument to read from stdin.\n\
                  e.g. echo '# meeting' | ddakji-cli add -"
)]
struct Cli {
    /// Print results as JSON (for scripts and AI clients)
    #[arg(long, global = true)]
    json: bool,

    /// Use a specific data folder (default: same as the app)
    #[arg(long, global = true, value_name = "DIR")]
    data_dir: Option<PathBuf>,

    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// List notes (id, collection, first line)
    List,
    /// Print a note's body (--json for the full note with metadata)
    Get { id: String },
    /// Create a note — body from the argument or stdin ('-')
    Add {
        /// Body text, '-' for stdin
        body: String,
        #[arg(long)]
        group: Option<String>,
        #[arg(long)]
        color: Option<String>,
        #[arg(long)]
        title: Option<String>,
        /// Open the new note in an app window
        #[arg(long)]
        open: bool,
    },
    /// Append to the end of a note
    Append {
        id: String,
        /// Text to append, '-' for stdin
        text: String,
    },
    /// Replace the whole body
    Edit {
        id: String,
        /// New body, '-' for stdin
        body: String,
    },
    /// Change metadata — collection, color, title (empty string clears)
    Set {
        id: String,
        /// Collection name, "" removes the note from its collection
        #[arg(long)]
        group: Option<String>,
        #[arg(long)]
        color: Option<String>,
        /// Title shown in the list, "" reverts to body-derived
        #[arg(long)]
        title: Option<String>,
    },
    /// Move a note to the trash (undo with `restore`)
    Delete { id: String },
    /// List trashed notes (id, deleted time, first line), newest first
    Trash,
    /// Restore a note from the trash
    Restore { id: String },
    /// Open a note in an app window (starts the app if needed)
    Open { id: String },
    /// List collection names
    Groups,
    /// Merge moved (and its whole collection) into target's collection
    Merge { moved: String, target: String },
    /// Print or install the AI agent guide
    Skill {
        /// Install into the skills folder instead of printing (overwrites)
        #[arg(long)]
        install: bool,
        /// Skills root to install into (default: ~/.claude/skills). Needed from
        /// WSL — a Windows exe cannot see the Linux home
        #[arg(long, value_name = "DIR")]
        dir: Option<PathBuf>,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let root = match cli
        .data_dir
        .clone()
        .or_else(ddakji_lib::store::default_data_root)
    {
        Some(r) => r,
        None => {
            eprintln!("Data folder not found — pass --data-dir");
            return ExitCode::FAILURE;
        }
    };
    let store = match Store::new(&root) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Cannot open the store ({}): {e}", root.display());
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

/// '-'는 stdin 전체로 치환 — AI 파이프라인의 기본 입력 경로
fn read_body(arg: String) -> Result<String, String> {
    if arg != "-" {
        return Ok(arg);
    }
    let mut buf = String::new();
    std::io::stdin()
        .read_to_string(&mut buf)
        .map_err(|e| format!("Failed to read stdin: {e}"))?;
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
            open,
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
            if open {
                launch_gui(&note.meta.id)?;
            }
            if json {
                to_json(&note)
            } else {
                Ok(note.meta.id)
            }
        }
        Cmd::Open { id } => {
            store.load(&id).ok_or("NOTE_NOT_FOUND")?;
            launch_gui(&id)?;
            Ok(String::new())
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
                return Err(
                    "Nothing to change — pass at least one of --group/--color/--title".into(),
                );
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
        Cmd::Skill { install, dir } => {
            if !install {
                return Ok(SKILL_MD.trim_end().to_string());
            }
            let root = dir
                .or_else(skills_root)
                .ok_or("Skills folder not found — pass --dir (e.g. ~/.claude/skills)")?;
            let target = root.join("ddakji");
            std::fs::create_dir_all(&target)
                .map_err(|e| format!("Cannot create the folder ({}): {e}", target.display()))?;
            let path = target.join("SKILL.md");
            std::fs::write(&path, SKILL_MD)
                .map_err(|e| format!("Cannot write the file ({}): {e}", path.display()))?;
            Ok(format!("{}", path.display()))
        }
        Cmd::Trash => {
            let items = store.list_trash();
            if json {
                return to_json(&items);
            }
            Ok(items
                .iter()
                .map(|t| {
                    format!(
                        "{}\t{}\t{}",
                        t.note.meta.id,
                        t.deleted_at,
                        first_line(&t.note)
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        Cmd::Restore { id } => {
            let note = store.restore(&id).map_err(|e| e.to_string())?;
            if json {
                to_json(&note)
            } else {
                Ok(String::new())
            }
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
                Ok("Already in the same collection".into())
            }
        }
    }
}

/// 스킬 루트 `~/.claude/skills` — HOME(유닉스)과 USERPROFILE(윈도우) 둘 다 본다
fn skills_root() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| PathBuf::from(h).join(".claude").join("skills"))
}

/// GUI 실행 파일 — CLI와 같은 폴더의 ddakji(.exe)
fn gui_exe() -> Result<std::path::PathBuf, String> {
    let name = if cfg!(windows) {
        "ddakji.exe"
    } else {
        "ddakji"
    };
    let exe = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot resolve the executable path")?
        .join(name);
    if exe.is_file() {
        Ok(exe)
    } else {
        Err(format!("App executable not found: {}", exe.display()))
    }
}

/// 앱에 `--open <id>` 전달 — 떠 있으면 single-instance로 그 인스턴스가
/// 처리하고(#12), 없으면 앱이 켜지면서 처리한다. 응답은 기다리지 않는다.
fn launch_gui(id: &str) -> Result<(), String> {
    std::process::Command::new(gui_exe()?)
        .args(["--open", id])
        .spawn()
        .map_err(|e| format!("Failed to launch the app: {e}"))?;
    Ok(())
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
                open: false,
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
                open: false,
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
                open: false,
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
    fn open_missing_note_fails_before_launching_gui() {
        let (_d, s) = store();
        let e = run(
            &s,
            Cmd::Open {
                id: "20990101-000000-abcdef".into(),
            },
            false,
        )
        .unwrap_err();
        assert_eq!(e, "NOTE_NOT_FOUND");
    }

    #[test]
    fn open_without_gui_binary_reports_clearly() {
        // 테스트 바이너리 옆에는 ddakji(.exe)가 없다 — 명확한 에러여야 한다
        let (_d, s) = store();
        let id = add(&s, "열 노트");
        let e = run(&s, Cmd::Open { id }, false).unwrap_err();
        assert!(e.contains("App executable not found"), "{e}");
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

    #[test]
    fn deleted_note_moves_to_trash_and_restores() {
        // 삭제는 휴지통 이동이므로 CLI에서도 되돌릴 수 있어야 한다 (#112).
        let (_d, s) = store();
        let id = add(&s, "# 되살릴 노트");
        run(&s, Cmd::Delete { id: id.clone() }, false).unwrap();
        assert!(!run(&s, Cmd::List, false).unwrap().contains(&id));

        let trash = run(&s, Cmd::Trash, false).unwrap();
        assert!(trash.contains(&id), "휴지통 목록에 있어야 한다");
        assert!(trash.contains("# 되살릴 노트"));

        run(&s, Cmd::Restore { id: id.clone() }, false).unwrap();
        assert!(run(&s, Cmd::List, false).unwrap().contains(&id));
        assert_eq!(
            run(&s, Cmd::Get { id }, false).unwrap(),
            "# 되살릴 노트",
            "본문이 그대로 돌아와야 한다"
        );
    }

    #[test]
    fn trash_is_empty_by_default() {
        let (_d, s) = store();
        add(&s, "살아 있는 노트");
        assert_eq!(run(&s, Cmd::Trash, false).unwrap(), "");
        assert_eq!(run(&s, Cmd::Trash, true).unwrap(), "[]");
    }

    #[test]
    fn restoring_unknown_note_fails() {
        let (_d, s) = store();
        run(
            &s,
            Cmd::Restore {
                id: "20990101-000000-abcdef".into(),
            },
            false,
        )
        .unwrap_err();
    }

    #[test]
    fn skill_prints_the_embedded_document() {
        let (_d, s) = store();
        let out = run(
            &s,
            Cmd::Skill {
                install: false,
                dir: None,
            },
            false,
        )
        .unwrap();
        assert!(out.starts_with("---"), "프런트매터로 시작하는 스킬 문서");
        assert!(out.contains("name: ddakji"));
        assert!(out.contains("restore"), "휴지통 복원이 문서에 있어야 한다");
    }

    #[test]
    fn skill_install_writes_under_the_given_dir() {
        let (_d, s) = store();
        let target = TempDir::new().unwrap();
        let out = run(
            &s,
            Cmd::Skill {
                install: true,
                dir: Some(target.path().to_path_buf()),
            },
            false,
        )
        .unwrap();

        let written = target.path().join("ddakji").join("SKILL.md");
        assert!(written.exists(), "<dir>/ddakji/SKILL.md 에 심는다");
        assert!(
            out.contains(&written.display().to_string()),
            "심은 경로를 알려 준다"
        );
        assert_eq!(
            std::fs::read_to_string(&written).unwrap(),
            SKILL_MD,
            "내용은 바이너리에 박힌 것과 같아야 한다"
        );
    }

    #[test]
    fn skill_install_overwrites_an_older_copy() {
        // 앱이 갱신되면 스킬도 따라가야 한다 — 덮어쓰기가 이 명령의 존재 이유다.
        let (_d, s) = store();
        let target = TempDir::new().unwrap();
        let written = target.path().join("ddakji").join("SKILL.md");
        std::fs::create_dir_all(written.parent().unwrap()).unwrap();
        std::fs::write(&written, "낡은 내용").unwrap();

        run(
            &s,
            Cmd::Skill {
                install: true,
                dir: Some(target.path().to_path_buf()),
            },
            false,
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&written).unwrap(), SKILL_MD);
    }
}
