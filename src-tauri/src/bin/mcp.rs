//! ddakji-mcp — MCP(Model Context Protocol) stdio 서버 (#12 4단계).
//!
//! Claude Desktop 등 MCP 클라이언트가 ddakji 노트를 도구로 쓰게 한다.
//! CLI와 같은 [`Store`]를 링크하므로 모음집 규칙이 동일하게 적용되고,
//! 실행 중인 앱은 외부 변경 브리지로 화면을 갱신한다.
//!
//! 프로토콜은 줄 단위 JSON-RPC 2.0이라 SDK 없이 블로킹 stdio 루프로
//! 구현했다 — tokio 등 무거운 의존성이 필요 없다.

use std::io::{BufRead, Write};

use serde_json::{json, Value};

use ddakji_lib::store::{MetaPatch, Store};

fn main() {
    // 등록용 설정을 손으로 짜게 하지 않는다 — 경로를 자기 자신에게서 읽어 준다
    if std::env::args().any(|a| a == "--print-config") {
        match std::env::current_exe() {
            Ok(p) => println!("{}", client_config(&p)),
            Err(e) => {
                eprintln!("실행 파일 경로를 알 수 없습니다: {e}");
                std::process::exit(1);
            }
        }
        return;
    }
    let Some(root) = ddakji_lib::store::default_data_root() else {
        eprintln!("데이터 폴더를 찾을 수 없습니다");
        std::process::exit(1);
    };
    let store = match Store::new(&root) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("저장소를 열 수 없습니다: {e}");
            std::process::exit(1);
        }
    };
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(res) = handle(&store, &req) {
            let _ = writeln!(stdout, "{res}");
            let _ = stdout.flush();
        }
    }
}

/// Claude Desktop 등의 `mcpServers` 항목 — 그대로 붙여 넣을 수 있게 들여쓴다.
fn client_config(exe: &std::path::Path) -> String {
    serde_json::to_string_pretty(&json!({
        "mcpServers": { "ddakji": { "command": exe.display().to_string() } }
    }))
    .unwrap_or_default()
}

/// 요청 하나 처리. 알림(id 없음)은 None — 응답하지 않는다.
fn handle(store: &Store, req: &Value) -> Option<Value> {
    let id = req.get("id")?.clone();
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let result = match method {
        "initialize" => {
            // 클라이언트가 요청한 버전을 지원하는 범위에서 그대로 돌려준다
            let version = req
                .pointer("/params/protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("2025-03-26");
            json!({
                "protocolVersion": version,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "ddakji", "version": env!("CARGO_PKG_VERSION") },
            })
        }
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tool_defs() }),
        "tools/call" => {
            let name = req
                .pointer("/params/name")
                .and_then(Value::as_str)
                .unwrap_or("");
            let args = req
                .pointer("/params/arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match call_tool(store, name, &args) {
                Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
                Err(e) => json!({
                    "content": [{ "type": "text", "text": e }],
                    "isError": true,
                }),
            }
        }
        _ => {
            return Some(json!({
                "jsonrpc": "2.0", "id": id,
                "error": { "code": -32601, "message": format!("method not found: {method}") },
            }));
        }
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

fn tool_defs() -> Value {
    let id_prop = json!({ "type": "string", "description": "노트 id (list_notes로 확인)" });
    json!([
        {
            "name": "list_notes",
            "description": "모든 노트를 메타·본문 포함 JSON으로 나열한다",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "get_note",
            "description": "노트 하나를 읽는다",
            "inputSchema": { "type": "object", "properties": { "id": id_prop }, "required": ["id"] },
        },
        {
            "name": "create_note",
            "description": "새 노트를 만든다. 본문은 마크다운 (제목·체크박스·GFM 표 지원)",
            "inputSchema": { "type": "object", "properties": {
                "body": { "type": "string", "description": "마크다운 본문" },
                "group": { "type": "string", "description": "모음집 이름 (선택)" },
                "color": { "type": "string", "description": "yellow·green·pink·purple·blue·gray·charcoal (선택)" },
                "title": { "type": "string", "description": "목록 표시용 제목 (선택)" },
                "open": { "type": "boolean", "description": "true면 사용자 화면에 창을 띄운다 (선택)" },
            }, "required": ["body"] },
        },
        {
            "name": "append_note",
            "description": "노트 끝에 마크다운을 덧붙인다 (빈 줄로 구분). 열린 노트에는 edit보다 안전하다",
            "inputSchema": { "type": "object", "properties": {
                "id": id_prop, "text": { "type": "string" },
            }, "required": ["id", "text"] },
        },
        {
            "name": "edit_note",
            "description": "노트 본문 전체를 교체한다. 사용자가 편집 중일 수 있으니 append_note를 우선 고려",
            "inputSchema": { "type": "object", "properties": {
                "id": id_prop, "body": { "type": "string" },
            }, "required": ["id", "body"] },
        },
        {
            "name": "set_note_meta",
            "description": "모음집·색·제목을 바꾼다. 빈 문자열은 해제. 모음집에 멤버가 1명 남으면 자동 해제된다",
            "inputSchema": { "type": "object", "properties": {
                "id": id_prop,
                "group": { "type": "string" }, "color": { "type": "string" }, "title": { "type": "string" },
            }, "required": ["id"] },
        },
        {
            "name": "delete_note",
            "description": "노트를 휴지통으로 보낸다 (앱의 휴지통에서 복원 가능 — 그래도 사용자가 명시적으로 요청한 경우에만)",
            "inputSchema": { "type": "object", "properties": { "id": id_prop }, "required": ["id"] },
        },
        {
            "name": "list_trash",
            "description": "휴지통 목록 — 지운 노트와 지운 시각(deleted_at). 최근에 지운 것부터",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "restore_note",
            "description": "휴지통의 노트를 되살린다 (delete_note를 되돌리는 방법)",
            "inputSchema": { "type": "object", "properties": { "id": id_prop }, "required": ["id"] },
        },
        {
            "name": "list_groups",
            "description": "모음집 이름 목록",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "merge_notes",
            "description": "moved 노트(와 그 모음집 전체)를 target 노트의 모음집으로 통합한다",
            "inputSchema": { "type": "object", "properties": {
                "moved_id": id_prop, "target_id": id_prop,
            }, "required": ["moved_id", "target_id"] },
        },
        {
            "name": "open_note",
            "description": "노트를 사용자 화면의 앱 창으로 연다 (앱이 꺼져 있으면 시작)",
            "inputSchema": { "type": "object", "properties": { "id": id_prop }, "required": ["id"] },
        },
    ])
}

fn call_tool(store: &Store, name: &str, args: &Value) -> Result<String, String> {
    let arg = |k: &str| args.get(k).and_then(Value::as_str).map(String::from);
    let need = |k: &str| arg(k).ok_or_else(|| format!("'{k}' 인자가 필요합니다"));
    match name {
        "list_notes" => to_json(&store.list()),
        "get_note" => {
            let note = store.load(&need("id")?).ok_or("NOTE_NOT_FOUND")?;
            to_json(&note)
        }
        "create_note" => {
            let note = store.create().map_err(|e| e.to_string())?;
            let note = store
                .save_body(&note.meta.id, &need("body")?)
                .map_err(|e| e.to_string())?;
            let patch = MetaPatch {
                group: arg("group"),
                color: arg("color"),
                title: arg("title"),
                ..Default::default()
            };
            let note = if patch.group.is_some() || patch.color.is_some() || patch.title.is_some() {
                store
                    .save_meta(&note.meta.id, &patch)
                    .map_err(|e| e.to_string())?
            } else {
                note
            };
            if args.get("open").and_then(Value::as_bool) == Some(true) {
                launch_gui(&note.meta.id)?;
            }
            to_json(&note)
        }
        "append_note" => {
            let id = need("id")?;
            let note = store.load(&id).ok_or("NOTE_NOT_FOUND")?;
            let text = need("text")?;
            let body = if note.body.is_empty() {
                text
            } else {
                format!("{}\n\n{}", note.body.trim_end_matches('\n'), text)
            };
            to_json(&store.save_body(&id, &body).map_err(|e| e.to_string())?)
        }
        "edit_note" => {
            let note = store
                .save_body(&need("id")?, &need("body")?)
                .map_err(|e| e.to_string())?;
            to_json(&note)
        }
        "set_note_meta" => {
            let patch = MetaPatch {
                group: arg("group"),
                color: arg("color"),
                title: arg("title"),
                ..Default::default()
            };
            if patch.group.is_none() && patch.color.is_none() && patch.title.is_none() {
                return Err("바꿀 항목이 없습니다 — group/color/title 중 하나 이상".into());
            }
            to_json(
                &store
                    .save_meta(&need("id")?, &patch)
                    .map_err(|e| e.to_string())?,
            )
        }
        "delete_note" => {
            store.delete(&need("id")?).map_err(|e| e.to_string())?;
            Ok("deleted".into())
        }
        "list_trash" => to_json(&store.list_trash()),
        "restore_note" => to_json(&store.restore(&need("id")?).map_err(|e| e.to_string())?),
        "list_groups" => to_json(&store.group_names()),
        "merge_notes" => {
            let changed = store
                .merge_note_groups(&need("moved_id")?, &need("target_id")?)
                .map_err(|e| e.to_string())?;
            let group = store
                .load(&need("target_id")?)
                .and_then(|n| n.meta.group)
                .unwrap_or_default();
            Ok(json!({ "changed": changed, "group": group }).to_string())
        }
        "open_note" => {
            store.load(&need("id")?).ok_or("NOTE_NOT_FOUND")?;
            launch_gui(&need("id")?)?;
            Ok("opened".into())
        }
        other => Err(format!("unknown tool: {other}")),
    }
}

fn to_json<T: serde::Serialize>(v: &T) -> Result<String, String> {
    serde_json::to_string_pretty(v).map_err(|e| e.to_string())
}

/// 앱에 `--open <id>` 전달 — CLI와 동일한 single-instance 경로
fn launch_gui(id: &str) -> Result<(), String> {
    let name = if cfg!(windows) {
        "ddakji.exe"
    } else {
        "ddakji"
    };
    let exe = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("실행 경로를 알 수 없습니다")?
        .join(name);
    if !exe.is_file() {
        return Err(format!("GUI 실행 파일이 없습니다: {}", exe.display()));
    }
    std::process::Command::new(exe)
        .args(["--open", id])
        .spawn()
        .map_err(|e| format!("앱 실행 실패: {e}"))?;
    Ok(())
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

    fn rpc(store: &Store, body: Value) -> Option<Value> {
        handle(store, &body)
    }

    #[test]
    fn initialize_echoes_protocol_and_declares_tools() {
        let (_d, s) = store();
        let res = rpc(
            &s,
            json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": { "protocolVersion": "2025-06-18" } }),
        )
        .unwrap();
        assert_eq!(res["result"]["protocolVersion"], "2025-06-18");
        assert!(res["result"]["capabilities"]["tools"].is_object());
        assert_eq!(res["result"]["serverInfo"]["name"], "ddakji");
    }

    #[test]
    fn notifications_get_no_response() {
        let (_d, s) = store();
        assert!(rpc(
            &s,
            json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })
        )
        .is_none());
    }

    #[test]
    fn tools_list_exposes_all_tools() {
        let (_d, s) = store();
        let res = rpc(
            &s,
            json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
        )
        .unwrap();
        let names: Vec<&str> = res["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        for expected in [
            "list_notes",
            "get_note",
            "create_note",
            "append_note",
            "edit_note",
            "set_note_meta",
            "delete_note",
            "list_groups",
            "merge_notes",
            "open_note",
            "list_trash",
            "restore_note",
        ] {
            assert!(names.contains(&expected), "missing tool: {expected}");
        }
    }

    #[test]
    fn create_then_get_roundtrip_via_tools_call() {
        let (_d, s) = store();
        let res = rpc(
            &s,
            json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call",
                    "params": { "name": "create_note",
                                "arguments": { "body": "# MCP 노트", "group": "테스트" } } }),
        )
        .unwrap();
        let text = res["result"]["content"][0]["text"].as_str().unwrap();
        let note: Value = serde_json::from_str(text).unwrap();
        let id = note["meta"]["id"].as_str().unwrap();
        assert_eq!(note["meta"]["group"], "테스트");

        let got = rpc(
            &s,
            json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call",
                    "params": { "name": "get_note", "arguments": { "id": id } } }),
        )
        .unwrap();
        assert!(got["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("MCP 노트"));
    }

    #[test]
    fn missing_note_is_a_tool_error_not_a_protocol_error() {
        let (_d, s) = store();
        let res = rpc(
            &s,
            json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call",
                    "params": { "name": "get_note",
                                "arguments": { "id": "20990101-000000-abcdef" } } }),
        )
        .unwrap();
        assert_eq!(res["result"]["isError"], true);
        assert_eq!(res["result"]["content"][0]["text"], "NOTE_NOT_FOUND");
    }

    #[test]
    fn unknown_method_returns_jsonrpc_error() {
        let (_d, s) = store();
        let res = rpc(
            &s,
            json!({ "jsonrpc": "2.0", "id": 6, "method": "resources/list" }),
        )
        .unwrap();
        assert_eq!(res["error"]["code"], -32601);
    }

    #[test]
    fn delete_then_restore_roundtrip() {
        // 지우기만 하고 되돌리지 못하면 AI에게 위험한 도구가 된다 (#112).
        let (_d, s) = store();
        let id = s.create().unwrap().meta.id;
        s.save_body(&id, "# 되살릴 노트").unwrap();

        call_tool(&s, "delete_note", &json!({ "id": id })).unwrap();
        assert!(!call_tool(&s, "list_notes", &json!({}))
            .unwrap()
            .contains(&id));

        let trash = call_tool(&s, "list_trash", &json!({})).unwrap();
        assert!(trash.contains(&id), "휴지통 목록에 있어야 한다");
        assert!(trash.contains("deleted_at"), "지운 시각을 함께 준다");

        call_tool(&s, "restore_note", &json!({ "id": id })).unwrap();
        let back = call_tool(&s, "get_note", &json!({ "id": id })).unwrap();
        assert!(back.contains("되살릴 노트"));
    }

    #[test]
    fn print_config_emits_a_registerable_block() {
        // 사용자가 손으로 JSON을 짜지 않게 — 그대로 붙여 넣을 수 있어야 한다.
        let cfg = client_config(std::path::Path::new("C:\\Programs\\ddakji\\ddakji-mcp.exe"));
        let v: Value = serde_json::from_str(&cfg).unwrap();
        assert_eq!(
            v["mcpServers"]["ddakji"]["command"],
            "C:\\Programs\\ddakji\\ddakji-mcp.exe"
        );
        assert!(cfg.contains('\n'), "사람이 읽도록 들여쓴다");
    }
}
