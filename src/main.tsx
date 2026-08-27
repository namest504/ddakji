import React from "react";
import ReactDOM from "react-dom/client";
import NoteApp from "./note/NoteApp";
import ListApp from "./list/ListApp";
import { I18nProvider } from "./lib/i18n";
import StubPreview from "./stub/StubPreview";
import { initTheme } from "./lib/theme";
import "./styles.css";

initTheme();

const params = new URLSearchParams(location.search);
const noteId = params.get("note");
const view = params.get("view");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      {noteId ? (
        <NoteApp noteId={noteId} />
      ) : view === "list" ? (
        <ListApp />
      ) : view === "stub" ? (
        <StubPreview />
      ) : (
        <div>ddakji</div>
      )}
    </I18nProvider>
  </React.StrictMode>,
);
