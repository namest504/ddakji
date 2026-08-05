import React from "react";
import ReactDOM from "react-dom/client";
import NoteApp from "./note/NoteApp";
import ListApp from "./list/ListApp";
import { initTheme } from "./lib/theme";
import "./styles.css";

initTheme();

const params = new URLSearchParams(location.search);
const noteId = params.get("note");
const view = params.get("view");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {noteId ? <NoteApp noteId={noteId} /> : view === "list" ? <ListApp /> : <div>stickdown</div>}
  </React.StrictMode>
);
