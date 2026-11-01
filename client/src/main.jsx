import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, allPages, getToken, setToken } from "./api";
import { ErrorBox, Loading, useResource } from "./shared";
import Auth from "./Auth";
import Tasks from "./Tasks";
import Subjects from "./Subjects";
import Stats from "./Stats";
import TaskDetail from "./TaskDetail";
import { Editor } from "./Editors";
import "./style.css";

function Workspace({ user, logout }) {
  const [view, setView] = useState("tasks");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = () => setRevision((n) => n + 1);
  const subjects = useResource(
    (signal) => allPages("/subjects", signal),
    [revision],
  );
  async function exit() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      setToken(null);
      logout();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function create() {
    if (subjects.loading || subjects.error) return;
    setEditor(subjects.data.length ? "task" : "subject");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("tasks");
          }}
          className="brand"
        >
          <span className="brand-mark">s.</span>study tracker
        </a>
        <span className="sidebar-caption">УЧЕБНОЕ ПРОСТРАНСТВО</span>
        <nav>
          {[
            ["tasks", "▤", "Мои задания"],
            ["subjects", "▦", "Предметы"],
            ["stats", "◷", "Прогресс"],
          ].map(([key, icon, label]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => setView(key)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
              {key === "tasks" && (
                <span aria-hidden="true" className="nav-arrow">
                  ↗
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>ПОНЕМНОГУ, КАЖДЫЙ ДЕНЬ</span>
          <p>
            Не обязательно успеть всё.
            <br />
            Начни с главного.
          </p>
          <div className="note-line" />
        </div>
        <div className="profile">
          <span className="avatar">{user.name[0].toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small title={user.email}>{user.email}</small>
          </div>
          <button aria-label="Выйти" disabled={busy} onClick={exit}>
            ↪
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Мой семестр <span className="muted">/ Личное пространство</span>
          </span>
          <span>
            {new Intl.DateTimeFormat("ru", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </span>
        </header>
        <main className="content">
          <ErrorBox message={error} />
          <ErrorBox message={subjects.error} retry={subjects.reload} />
          {view === "tasks" && (
            <>
              <Stats revision={revision} compact />
              <Tasks
                subjects={subjects.data || []}
                revision={revision}
                open={setSelected}
                create={create}
                ready={!subjects.loading && !subjects.error}
              />
            </>
          )}
          {view === "subjects" && (
            <Subjects revision={revision} changed={changed} />
          )}
          {view === "stats" && <Stats revision={revision} />}
          {editor && (
            <Editor
              kind={editor}
              subjects={subjects.data || []}
              close={() => setEditor("")}
              saved={() => {
                changed();
                if (editor === "subject") setView("subjects");
              }}
            />
          )}
          {selected && (
            <TaskDetail
              id={selected}
              subjects={subjects.data || []}
              close={() => setSelected(null)}
              changed={changed}
            />
          )}
        </main>
        <footer>
          study tracker <span>Один шаг ближе к готовому.</span>
        </footer>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function restore() {
    setChecking(true);
    setError("");
    try {
      setUser(await api("/auth/me"));
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setNotice("Сессия завершена. Войдите снова.");
    };
    window.addEventListener("session-expired", expired);
    if (getToken()) restore();
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (checking)
    return (
      <main className="boot">
        <Loading />
      </main>
    );
  if (error && getToken())
    return (
      <main className="boot">
        <ErrorBox message={error} retry={restore} />
      </main>
    );
  return user ? (
    <Workspace
      user={user}
      logout={() => {
        setUser(null);
        setNotice("");
      }}
    />
  ) : (
    <Auth notice={notice} onLogin={setUser} />
  );
}

createRoot(document.getElementById("root")).render(<App />);
