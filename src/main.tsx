import React from "react";
import ReactDOM from "react-dom/client";
import NoteApp from "./note/NoteApp";
import ListApp from "./list/ListApp";
import StubPreview from "./stub/StubPreview";
import { initTheme } from "./lib/theme";
import "./styles.css";

initTheme();

// 글라스(투명+블러)는 Windows Acrylic 전제 — 그 외 플랫폼은 불투명 폴백
if (!navigator.userAgent.includes("Windows")) {
  document.documentElement.dataset.glass = "off";
}

const params = new URLSearchParams(location.search);
const noteId = params.get("note");
const view = params.get("view");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {noteId ? (
      <NoteApp noteId={noteId} />
    ) : view === "list" ? (
      <ListApp />
    ) : view === "stub" ? (
      <StubPreview />
    ) : (
      <div>stickdown</div>
    )}
  </React.StrictMode>,
);
