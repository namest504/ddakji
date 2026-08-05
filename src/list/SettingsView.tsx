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
const REPO_URL = "https://github.com/namest504/stickdown";

export default function SettingsView({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    api.getSettings().then(setSettings);
    getVersion().then(setVersion).catch(() => {});
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

  const openData = async () => {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(await api.dataRoot());
  };

  const openRepo = async () => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(REPO_URL);
  };

  if (!settings) return null;
  return (
    <div className="list settings">
      <div className="list-header">
        <button className="icon-btn" title="뒤로" onClick={onBack}><BackIcon /></button>
        <span className="settings-title">설정</span>
      </div>
      <div className="list-items">
        <div className="inset-group">
          <div className="settings-row" onClick={toggleAutostart}>
            <span>부팅 시 시작</span>
            <span className={"switch" + (autostart ? " on" : "")} role="switch" aria-checked={autostart}>
              <span className="knob" />
            </span>
          </div>
        </div>

        <div className="group-label">새 노트 기본값</div>
        <div className="inset-group">
          <div className="settings-row">
            <span>색상</span>
            <span className="swatch-row">
              {COLORS.map((c) => (
                <button key={c} data-color={c}
                  className={"swatch" + (settings.default_color === c ? " selected" : "")}
                  onClick={() => patch({ default_color: c })} />
              ))}
            </span>
          </div>
          <div className="settings-row">
            <span>폰트</span>
            <span className="seg">
              {FONTS.map((f) => (
                <button key={f.key} style={{ fontFamily: fontStack(f.key) }}
                  className={settings.default_font_family === f.key ? "active" : ""}
                  onClick={() => patch({ default_font_family: f.key })}>
                  {f.label}
                </button>
              ))}
            </span>
          </div>
          <div className="settings-row">
            <span>글씨 크기</span>
            <span className="stepper">
              <button onClick={() => patch({ default_font_size: clampFontSize(settings.default_font_size - 1) })}>−</button>
              <b>{settings.default_font_size}</b>
              <button onClick={() => patch({ default_font_size: clampFontSize(settings.default_font_size + 1) })}>＋</button>
            </span>
          </div>
        </div>

        <div className="inset-group">
          <div className="settings-row link" onClick={openData}>데이터 폴더 열기</div>
        </div>

        <div className="inset-group">
          <div className="settings-row">
            <span>버전</span>
            <span className="row-dim">{version}</span>
          </div>
          <div className="settings-row link" onClick={openRepo}>GitHub</div>
        </div>
      </div>
    </div>
  );
}
