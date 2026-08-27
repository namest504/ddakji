import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/api", () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  openDataDir: vi.fn(),
  openAppDir: vi.fn(),
  installAiSkill: vi.fn(),
  mcpConfig: vi.fn(),
  dataRoot: vi.fn(),
  setStoragePath: vi.fn(),
  listSystemFonts: vi.fn(),
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("9.9.9") }));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
  enable: vi.fn(),
  disable: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));

import * as api from "../lib/api";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import SettingsView from "./SettingsView";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSettings).mockResolvedValue({
    default_color: "yellow",
    default_font_family: "system",
    default_font_size: 16,
    favorite_fonts: [],
    theme: "system",
    language: "system",
  });
  vi.mocked(api.dataRoot).mockResolvedValue("C:/data");
});
afterEach(cleanup);

describe("SettingsView AI 연동 (#161)", () => {
  it("스킬 설치는 심은 경로를 보여 준다 — README 없이 완결", async () => {
    vi.mocked(api.installAiSkill).mockResolvedValue(
      "C:\\Users\\u\\.claude\\skills\\ddakji\\SKILL.md",
    );
    render(<SettingsView onBack={() => {}} />);
    fireEvent.click(await screen.findByText("Claude 스킬 설치"));
    await screen.findByText(/SKILL\.md/);
    expect(api.installAiSkill).toHaveBeenCalled();
  });

  it("MCP 설정 복사는 클립보드에 담고 다음 행동을 알려 준다", async () => {
    vi.mocked(api.mcpConfig).mockResolvedValue('{"mcpServers":{}}');
    render(<SettingsView onBack={() => {}} />);
    fireEvent.click(await screen.findByText(/MCP 설정 복사/));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('{"mcpServers":{}}'));
    await screen.findByText(/붙여넣으세요/);
  });

  it("CLI 위치 열기는 앱 폴더를 연다", async () => {
    render(<SettingsView onBack={() => {}} />);
    fireEvent.click(await screen.findByText(/CLI 위치 열기/));
    await waitFor(() => expect(api.openAppDir).toHaveBeenCalled());
  });
});
