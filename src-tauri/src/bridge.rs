//! 외부 변경 브리지 (#12): CLI·동기화 등 밖에서 바뀐 노트 파일을 주기적으로
//! 감지해 **앱 내부 이벤트로 번역**한다. 프런트는 변경의 출처를 몰라도 된다 —
//! 기존 갱신 경로(`groups-changed`, `note-updated`)가 그대로 동작한다.
//!
//! 자기 쓰기는 [`Store`]가 스냅숏으로 걸러내므로 여기서는 순수하게 외부
//! 변경만 흐른다 — 오인 이벤트로 편집 중 커서가 리셋되는 일이 없다.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::commands::WindowNotes;
use crate::store::{ExternalChange, Store};

/// 감지 주기 — 목록 폴링(2초)과 같은 리듬
const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL_INTERVAL);
        poll_once(&app);
    });
}

fn poll_once(app: &AppHandle) {
    let changes = {
        let store = app.state::<Mutex<Store>>();
        let Ok(s) = store.lock() else { return };
        s.external_changes()
    };
    if changes.is_empty() {
        return;
    }
    // 그룹 파생 상태(멤버 목록·점 인디케이터) 갱신 — 목록 창은 자체 폴링이 처리
    let _ = app.emit("groups-changed", ());
    for change in changes {
        match change {
            ExternalChange::Changed(id) => {
                let Some(label) = window_showing(app, &id) else {
                    continue;
                };
                let note = {
                    let store = app.state::<Mutex<Store>>();
                    store.lock().ok().and_then(|s| s.load(&id))
                };
                if let Some(note) = note {
                    let _ = app.emit_to(label, "note-updated", &note);
                }
            }
            ExternalChange::Removed(id) => {
                // 밖에서 삭제된 노트의 창은 좀비가 되기 전에 닫는다
                if let Some(label) = window_showing(app, &id) {
                    if let Some(w) = app.get_webview_window(&label) {
                        let _ = w.destroy();
                    }
                }
            }
        }
    }
}

/// 이 노트를 표시 중인 창의 label
fn window_showing(app: &AppHandle, id: &str) -> Option<String> {
    let wn = app.try_state::<WindowNotes>()?;
    let map = wn.0.lock().ok()?;
    map.iter()
        .find(|(_, nid)| nid.as_str() == id)
        .map(|(l, _)| l.clone())
}
