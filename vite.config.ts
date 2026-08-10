/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // cargo가 target/에 쓰는 파일을 워처가 건드리면 Windows에서 EBUSY로 죽는다
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"] },
});
