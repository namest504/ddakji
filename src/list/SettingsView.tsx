import { useEffect, useState } from "react";
import { useLang, useT, type MsgKey } from "../lib/i18n";
import { getVersion } from "@tauri-apps/api/app";
import * as api from "../lib/api";
import type { FontFamily, NoteColor, Settings } from "../lib/api";
import { clampFontSize, fontStack } from "../lib/noteUtils";
import { BackIcon } from "../note/icons";

const COLORS: NoteColor[] = ["yellow", "green", "pink", "purple", "blue", "gray", "charcoal"];
const FONTS: { key: FontFamily; label: MsgKey }[] = [
  { key: "system", label: "fontSystem" },
  { key: "serif", label: "fontSerif" },
  { key: "mono", label: "fontMono" },
];
const REPO_URL = "https://github.com/namest504/ddakji";

export default function SettingsView({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");
  const [rootPath, setRootPath] = useState("");
  // AI 연동 (#161) — 클릭 결과를 그 자리에서 말해 준다 (README 없이 완결)
  const [skillPath, setSkillPath] = useState<string | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
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
        <button className="icon-btn" title={t("goBack")} onClick={onBack}>
          <BackIcon />
        </button>
        <span className="settings-title">{t("settings")}</span>
      </div>
      <div className="list-items">
        <div className="inset-group">
          <div className="settings-row" onClick={toggleAutostart}>
            <span>{t("autostart")}</span>
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
            <span>{t("theme")}</span>
            <span className="seg">
              {(
                [
                  ["system", t("themeSystem")],
                  ["light", t("themeLight")],
                  ["dark", t("themeDark")],
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
          <div className="settings-row">
            <span>{t("language")}</span>
            <span className="seg">
              {(
                [
                  ["system", t("langSystem")],
                  ["ko", "한국어"],
                  ["en", "English"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={settings.language === k ? "active" : ""}
                  onClick={() => patch({ language: k })}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="group-label">{t("newNoteDefaults")}</div>
        <div className="inset-group">
          <div className="settings-row">
            <span>{t("color")}</span>
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
            <span>{t("font")}</span>
            <span className="seg wrap">
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  style={{ fontFamily: fontStack(f.key) }}
                  className={settings.default_font_family === f.key ? "active" : ""}
                  onClick={() => patch({ default_font_family: f.key })}
                >
                  {t(f.label)}
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
            <span>{t("fontSize")}</span>
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

        <div className="group-label">{t("favoriteFonts")}</div>
        <div className="inset-group">
          {settings.favorite_fonts.map((f) => (
            <div key={f} className="settings-row">
              <span style={{ fontFamily: fontStack(f) }}>{f}</span>
              <button className="icon-btn" title={t("remove")} onClick={() => removeFavorite(f)}>
                −
              </button>
            </div>
          ))}
          <div className="settings-row link" onClick={togglePicker}>
            {showPicker ? t("close") : t("addFont")}
          </div>
          {showPicker && (
            <div className="font-picker">
              <input
                className="font-custom"
                placeholder={t("fontSearch")}
                value={fontQuery}
                onChange={(e) => setFontQuery(e.target.value)}
                autoFocus
              />
              <div className="font-list">
                {sysFonts === null && <div className="font-item">{t("loading")}</div>}
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
                  <div className="font-item">{t("fontListFailed")}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="group-label">{t("aiSection")}</div>
        <div className="inset-group">
          <div
            className="settings-row link"
            onClick={() => {
              api
                .installAiSkill()
                .then(setSkillPath)
                .catch(() => {});
            }}
          >
            {t("installSkill")}
          </div>
          {skillPath && (
            <div className="settings-row">
              <span className="row-dim">{t("skillInstalled", { path: skillPath })}</span>
            </div>
          )}
          <div
            className="settings-row link"
            onClick={async () => {
              const cfg = await api.mcpConfig().catch(() => null);
              if (cfg === null) return;
              const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
              await writeText(cfg);
              setMcpCopied(true);
              window.setTimeout(() => setMcpCopied(false), 4000);
            }}
          >
            {t("copyMcp")}
          </div>
          {mcpCopied && (
            <div className="settings-row">
              <span className="row-dim">{t("mcpCopied")}</span>
            </div>
          )}
          <div className="settings-row link" onClick={() => api.openAppDir().catch(() => {})}>
            {t("openCliFolder")}
          </div>
        </div>

        <div className="group-label">{t("storage")}</div>
        <div className="inset-group">
          <div className="settings-row">
            <span className="row-dim path-text">{rootPath}</span>
          </div>
          <div className="settings-row link" onClick={openData}>
            {t("openDataFolder")}
          </div>
          <div
            className="settings-row link"
            onClick={async () => {
              const { open, ask } = await import("@tauri-apps/plugin-dialog");
              const dir = await open({ directory: true, title: t("pickStorageFolder") });
              if (typeof dir !== "string") return;
              const ok = await ask(t("moveDataConfirm", { dir }), {
                title: t("changeStorage"),
                kind: "warning",
                okLabel: t("move"),
                cancelLabel: t("cancel"),
              });
              if (ok) await api.setStoragePath(dir);
            }}
          >
            {t("changeStorageEllipsis")}
          </div>
        </div>

        <div className="inset-group">
          <div className="settings-row">
            <span>{t("version")}</span>
            <span className="row-dim">{version}</span>
          </div>
          <div
            className="settings-row link"
            onClick={async () => {
              const { openUrl } = await import("@tauri-apps/plugin-opener");
              // 문서도 화면 언어를 따른다 — ko면 .ko.md (#143)
              const doc = lang === "ko" ? "usage.ko.md" : "usage.md";
              await openUrl(`${REPO_URL}/blob/main/docs/${doc}`);
            }}
          >
            {t("viewUsage")}
          </div>
          <div className="settings-row link" onClick={openRepo}>
            GitHub
          </div>
        </div>
      </div>
    </div>
  );
}
