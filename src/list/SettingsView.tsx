import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import * as api from "../lib/api";
import type { FontFamily, NoteColor, Settings } from "../lib/api";
import { clampFontSize, fontStack } from "../lib/noteUtils";
import { BackIcon } from "../note/icons";

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];
const FONTS: { key: FontFamily; label: string }[] = [
  { key: "system", label: "시스템" },
  { key: "serif", label: "세리프" },
  { key: "mono", label: "고정폭" },
];
const REPO_URL = "https://github.com/namest504/ddakji";

export default function SettingsView({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [sysFonts, setSysFonts] = useState<string[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [fontQuery, setFontQuery] = useState("");

  useEffect(() => {
    api.getSettings().then(setSettings);
    api
      .dataRoot()
      .then(setRootPath)
      .catch(() => {});
    getVersion()
      .then(setVersion)
      .catch(() => {});
    import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled().then(setAutostart))
      .catch(() => {});
  }, []);

  const patch = (p: Partial<Settings>) =>
    setSettings((s) => {
      if (!s) return s;
      const next = { ...s, ...p };
      api.saveSettings(next);
      return next;
    });

  const toggleAutostart = async () => {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
    if (await isEnabled()) await disable();
    else await enable();
    setAutostart(await isEnabled());
  };

  // opener의 openPath는 경로 스코프 권한이 별도로 필요해 프런트에서 실패한다 — Rust 커맨드로 연다
  const openData = () => api.openDataDir();

  const togglePicker = () => {
    if (!showPicker && sysFonts === null) {
      api
        .listSystemFonts()
        .then(setSysFonts)
        .catch(() => setSysFonts([]));
    }
    setShowPicker(!showPicker);
  };
  const addFavorite = (f: string) => {
    if (!settings || settings.favorite_fonts.includes(f)) return;
    patch({ favorite_fonts: [...settings.favorite_fonts, f] });
  };
  const removeFavorite = (f: string) => {
    if (!settings) return;
    patch({ favorite_fonts: settings.favorite_fonts.filter((x) => x !== f) });
  };

  const openRepo = async () => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(REPO_URL);
  };

  if (!settings) return null;
  return (
    <div className="list settings">
      <div className="list-header">
        <button className="icon-btn" title="뒤로" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="settings-title">설정</span>
      </div>
      <div className="list-items">
        <div className="inset-group">
          <div className="settings-row" onClick={toggleAutostart}>
            <span>부팅 시 시작</span>
            <span
              className={"switch" + (autostart ? " on" : "")}
              role="switch"
              aria-checked={autostart}
            >
              <span className="knob" />
            </span>
          </div>
        </div>

        <div className="inset-group">
          <div className="settings-row">
            <span>테마</span>
            <span className="seg">
              {(
                [
                  ["system", "시스템"],
                  ["light", "라이트"],
                  ["dark", "다크"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={settings.theme === k ? "active" : ""}
                  onClick={() => patch({ theme: k })}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="group-label">새 노트 기본값</div>
        <div className="inset-group">
          <div className="settings-row">
            <span>색상</span>
            <span className="swatch-row">
              {COLORS.map((c) => (
                <button
                  key={c}
                  data-color={c}
                  className={"swatch" + (settings.default_color === c ? " selected" : "")}
                  onClick={() => patch({ default_color: c })}
                />
              ))}
            </span>
          </div>
          <div className="settings-row">
            <span>폰트</span>
            <span className="seg wrap">
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  style={{ fontFamily: fontStack(f.key) }}
                  className={settings.default_font_family === f.key ? "active" : ""}
                  onClick={() => patch({ default_font_family: f.key })}
                >
                  {f.label}
                </button>
              ))}
              {settings.favorite_fonts.map((f) => (
                <button
                  key={f}
                  style={{ fontFamily: fontStack(f) }}
                  className={settings.default_font_family === f ? "active" : ""}
                  onClick={() => patch({ default_font_family: f })}
                >
                  {f}
                </button>
              ))}
            </span>
          </div>
          <div className="settings-row">
            <span>글씨 크기</span>
            <span className="stepper">
              <button
                onClick={() =>
                  patch({ default_font_size: clampFontSize(settings.default_font_size - 1) })
                }
              >
                −
              </button>
              <b>{settings.default_font_size}</b>
              <button
                onClick={() =>
                  patch({ default_font_size: clampFontSize(settings.default_font_size + 1) })
                }
              >
                ＋
              </button>
            </span>
          </div>
        </div>

        <div className="group-label">자주 쓰는 폰트</div>
        <div className="inset-group">
          {settings.favorite_fonts.map((f) => (
            <div key={f} className="settings-row">
              <span style={{ fontFamily: fontStack(f) }}>{f}</span>
              <button className="icon-btn" title="제거" onClick={() => removeFavorite(f)}>
                −
              </button>
            </div>
          ))}
          <div className="settings-row link" onClick={togglePicker}>
            {showPicker ? "닫기" : "＋ 폰트 추가 (설치된 폰트 조회)"}
          </div>
          {showPicker && (
            <div className="font-picker">
              <input
                className="font-custom"
                placeholder="폰트 검색…"
                value={fontQuery}
                onChange={(e) => setFontQuery(e.target.value)}
                autoFocus
              />
              <div className="font-list">
                {sysFonts === null && <div className="font-item">불러오는 중…</div>}
                {sysFonts
                  ?.filter((f) => f.toLowerCase().includes(fontQuery.trim().toLowerCase()))
                  .map((f) => (
                    <div
                      key={f}
                      className={
                        "font-item" + (settings.favorite_fonts.includes(f) ? " added" : "")
                      }
                      style={{ fontFamily: fontStack(f) }}
                      onClick={() => addFavorite(f)}
                    >
                      {f}
                    </div>
                  ))}
                {sysFonts !== null && sysFonts.length === 0 && (
                  <div className="font-item">폰트 목록을 가져오지 못했습니다</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="group-label">저장 위치</div>
        <div className="inset-group">
          <div className="settings-row">
            <span className="row-dim path-text">{rootPath}</span>
          </div>
          <div className="settings-row link" onClick={openData}>
            데이터 폴더 열기
          </div>
          <div
            className="settings-row link"
            onClick={async () => {
              const { open, ask } = await import("@tauri-apps/plugin-dialog");
              const dir = await open({ directory: true, title: "새 저장 폴더 선택" });
              if (typeof dir !== "string") return;
              const ok = await ask(`데이터를 다음 위치로 이동하고 앱을 다시 시작합니다:\n${dir}`, {
                title: "저장 위치 변경",
                kind: "warning",
                okLabel: "이동",
                cancelLabel: "취소",
              });
              if (ok) await api.setStoragePath(dir);
            }}
          >
            저장 위치 변경…
          </div>
        </div>

        <div className="inset-group">
          <div className="settings-row">
            <span>버전</span>
            <span className="row-dim">{version}</span>
          </div>
          <div
            className="settings-row link"
            onClick={async () => {
              const { openUrl } = await import("@tauri-apps/plugin-opener");
              await openUrl(`${REPO_URL}/blob/main/docs/usage.md`);
            }}
          >
            사용법 보기
          </div>
          <div className="settings-row link" onClick={openRepo}>
            GitHub
          </div>
        </div>
      </div>
    </div>
  );
}
