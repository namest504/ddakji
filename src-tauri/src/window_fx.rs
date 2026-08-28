//! 창 단위 시각 효과 (#171) — 병합 예고에서 끌던 창을 반투명하게.
//!
//! 딱지는 불투명 창(Liquid Glass 폐기)이라 웹뷰 안에서는 "비쳐 보이기"를 만들
//! 수 없다. Windows 레이어드 윈도우 알파는 창 생성 옵션과 무관하게 나중에 켤 수
//! 있으므로 이것만 쓴다. 다른 플랫폼은 조용히 무시 — 예고는 칩·들썩임만으로도
//! 성립한다.

/// 창 전체 불투명도 (0=투명, 255=불투명). 실패는 무시한다 — 예고 장식일 뿐,
/// 판정·데이터에는 영향이 없다.
pub fn set_alpha(window: &tauri::WebviewWindow, alpha: u8) {
    imp::set_alpha(window, alpha);
}

#[cfg(windows)]
mod imp {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };

    pub fn set_alpha(window: &tauri::WebviewWindow, alpha: u8) {
        // tauri는 windows 0.61의 HWND를 돌려준다 — 내용은 같은 포인터라 우리
        // (0.62) 타입으로 감싸 쓴다.
        let Ok(h) = window.hwnd() else {
            return;
        };
        let hwnd = HWND(h.0);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if alpha == 255 {
                // 완전 불투명 복귀 시 레이어드 속성도 걷는다 — 남겨 두면 일부
                // 렌더링 경로(캡처·가속)가 느려질 수 있다.
                let _ = SetLayeredWindowAttributes(hwnd, Default::default(), 255, LWA_ALPHA);
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !(WS_EX_LAYERED.0 as isize));
            } else {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED.0 as isize);
                let _ = SetLayeredWindowAttributes(hwnd, Default::default(), alpha, LWA_ALPHA);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn set_alpha(_window: &tauri::WebviewWindow, _alpha: u8) {}
}
