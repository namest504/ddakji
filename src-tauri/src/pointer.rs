//! 드래그가 **끝났는지**를 알기 위한 최소한의 포인터 조회 (#115).
//!
//! Tauri는 창 이동(`onMoved`)만 알려 주고 "드래그가 끝났다"는 신호를 주지
//! 않는다. 그래서 합치기 판정이 "움직임이 멎었을 때"에 얹혀 있었고, 위치를
//! 가늠하려 잠깐 멈추는 순간 창이 제 발로 끌려갔다.
//!
//! 웹 쪽에서는 알 수 없다 — 창을 끄는 동안 마우스는 OS가 가져가므로 웹뷰에
//! `pointerup`이 오지 않는다. 그래서 Win32로 버튼 상태를 직접 본다.

use std::time::{Duration, Instant};

/// 버튼 상태 확인 주기. 사람이 놓았다고 느끼는 순간과의 지연이라 촘촘하게.
const POLL: Duration = Duration::from_millis(30);
/// 이만큼 기다려도 안 놓으면 판정을 포기한다 — 무한 대기로 스레드를 잡아 두지 않는다.
const MAX_WAIT: Duration = Duration::from_secs(20);

/// 주 마우스 버튼이 눌려 있는지. 알 수 없는 플랫폼은 `None`.
pub fn primary_button_down() -> Option<bool> {
    imp::primary_button_down()
}

/// 지금 커서가 있는 화면 좌표(물리 픽셀). 알 수 없는 플랫폼은 `None`.
pub fn cursor_pos() -> Option<(f64, f64)> {
    imp::cursor_pos()
}

/// 드래그가 끝날 때까지(주 버튼이 떨어질 때까지) 기다린다.
///
/// - `true`  — 놓였다. 이제 위치를 재고 판정해도 된다
/// - `false` — 너무 오래 눌려 있어 포기했다. 합치지 않는다
///
/// 버튼 상태를 알 수 없는 플랫폼에서는 곧바로 `true` — 기존 동작을 유지한다.
pub fn wait_for_drop() -> bool {
    let started = Instant::now();
    loop {
        match primary_button_down() {
            None => return true,
            Some(false) => return true,
            Some(true) => {
                if started.elapsed() >= MAX_WAIT {
                    return false;
                }
                std::thread::sleep(POLL);
            }
        }
    }
}

#[cfg(windows)]
mod imp {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};

    pub fn primary_button_down() -> Option<bool> {
        unsafe {
            // 버튼을 바꿔 쓰는 사용자는 물리적 주 버튼이 VK_RBUTTON이다
            let swapped = GetSystemMetrics(SM_SWAPBUTTON) != 0;
            let vk = if swapped { VK_RBUTTON } else { VK_LBUTTON };
            // 최상위 비트가 "지금 눌려 있음" (하위 비트는 마지막 조회 이후 눌림 이력)
            Some(GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000 != 0)
        }
    }

    pub fn cursor_pos() -> Option<(f64, f64)> {
        unsafe {
            let mut p = windows::Win32::Foundation::POINT::default();
            windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut p).ok()?;
            Some((p.x as f64, p.y as f64))
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn primary_button_down() -> Option<bool> {
        None
    }
    pub fn cursor_pos() -> Option<(f64, f64)> {
        None
    }
}
