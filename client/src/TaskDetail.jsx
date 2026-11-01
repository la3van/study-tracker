import { useState } from "react";
import { api, allPages } from "./api";
import {
  Modal,
  useResource,
  ErrorBox,
  Loading,
  Field,
  statuses,
  priorities,
  dateLabel,
  requiredTrim,
} from "./shared";
import { Editor, DeleteDialog } from "./Editors";

function ChecklistRow({ item, mutate, busy }) {
  const [editing, setEditing] = useState(false);
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await mutate("/" + item.id, "PATCH", {
      title: form.get("title").trim(),
      position: Number(form.get("position")),
    });
    if (ok) setEditing(false);
  }
  return (
    <li className="check-row">
      {editing ? (
        <form onSubmit={save} className="check-edit">
          <input
            aria-label="Текст пункта"
            name="title"
            required
            maxLength={200}
            defaultValue={item.title}
            onChange={requiredTrim}
          />
          <input
            aria-label="Порядок пункта"
            type="number"
            name="position"
            min={0}
            max={1000000}
            required
            defaultValue={item.position}
          />
          <button disabled={busy} type="submit">
            Сохранить пункт
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => setEditing(false)}
          >
            Отмена
          </button>
        </form>
      ) : (
        <>
          <label className={item.is_completed ? "checked" : ""}>
            <input
              type="checkbox"
              checked={item.is_completed}
              disabled={busy}
              onChange={() =>
                mutate("/" + item.id, "PATCH", {
                  is_completed: !item.is_completed,
                })
              }
            />
            <span>{item.title}</span>
          </label>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(true)}
            aria-label={"Редактировать пункт " + item.title}
          >
            Править
          </button>
          <button
            className="icon-button"
            disabled={busy}
            onClick={() => mutate("/" + item.id, "DELETE")}
            aria-label={"Удалить пункт " + item.title}
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}

export default function TaskDetail({ id, subjects, close, changed }) {
  const resource = useResource(
    (signal) =>
      Promise.all([
        api("/tasks/" + id, { signal }),
        allPages("/tasks/" + id + "/checklist", signal),
      ]),
    [id],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const task = resource.data?.[0];
  const items = resource.data?.[1] || [];
  async function mutate(path, method, body, checklist = true) {
    setBusy(true);
    setError("");
    try {
      await api("/tasks/" + id + (checklist ? "/checklist" : "") + path, {
        method,
        body,
      });
      resource.reload();
      changed();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (action === "edit")
    return (
      <Editor
        kind="task"
        value={task}
        subjects={subjects}
        close={() => setAction("")}
        saved={() => {
          resource.reload();
          changed();
        }}
      />
    );
  if (action === "delete")
    return (
      <DeleteDialog
        title={task.title}
        path={"/tasks/" + id}
        close={() => setAction("")}
        saved={() => {
          changed();
          close();
        }}
        detail="Задание и все пункты его чек-листа будут удалены."
      />
    );
  return (
    <Modal title={task?.title || "Задание"} close={close} busy={busy}>
      {resource.loading && <Loading />}
      <ErrorBox message={resource.error} retry={resource.reload} />
      <ErrorBox message={error} />
      {task && (
        <>
          <div className="detail-meta">
            <span className={"badge " + task.priority}>
              {priorities[task.priority]} приоритет
            </span>
            <span>
              {subjects.find((s) => s.id === task.subject_id)?.name ||
                "Предмет"}
            </span>
          </div>
          <p className="description">
            {task.description || "Описание пока не добавлено."}
          </p>
          <div className="detail-date">
            Дедлайн <strong>{dateLabel(task.due_at)}</strong>
          </div>
          {task.completed_at && (
            <p className="hint">Завершено {dateLabel(task.completed_at)}</p>
          )}
          <Field label="Статус задания">
            <select
              value={task.status}
              disabled={busy}
              onChange={(e) =>
                mutate("/status", "PATCH", { status: e.target.value }, false)
              }
            >
              {Object.entries(statuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <div className="check-heading">
            <h3>Маленькие шаги</h3>
            <span>
              {items.filter((i) => i.is_completed).length} / {items.length}
            </span>
          </div>
          <ul className="checklist">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                busy={busy}
                mutate={mutate}
              />
            ))}
          </ul>
          <form
            className="add-item"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate("", "POST", {
                  title: newTitle.trim(),
                  position: Math.min(
                    1000000,
                    Math.max(-1, ...items.map((i) => i.position)) + 1,
                  ),
                })
              )
                setNewTitle("");
            }}
          >
            <input
              aria-label="Новый пункт"
              placeholder="Добавить следующий шаг…"
              required
              maxLength={200}
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                requiredTrim(e);
              }}
            />
            <button disabled={busy} type="submit" aria-label="Добавить пункт">
              +
            </button>
          </form>
          <p className="hint">
            Чек-лист помогает разбить работу на шаги. Статус задания меняется
            отдельно.
          </p>
          <div className="modal-actions split">
            <button
              className="text-danger"
              disabled={busy}
              onClick={() => setAction("delete")}
            >
              Удалить задание
            </button>
            <button disabled={busy} onClick={() => setAction("edit")}>
              Редактировать
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
