import { useState } from "react";
import { api } from "./api";
import {
  Modal,
  ErrorBox,
  Field,
  requiredTrim,
  localDate,
  priorities,
} from "./shared";

export function Editor({ kind, value, subjects, close, saved }) {
  const task = kind === "task";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = task
      ? {
          title: form.get("title").trim(),
          description: form.get("description"),
          subject_id: form.get("subject_id"),
          due_at: new Date(form.get("due_at")).toISOString(),
          priority: form.get("priority"),
        }
      : { name: form.get("name").trim(), description: form.get("description") };
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "/" + (task ? "tasks" : "subjects") + (value ? "/" + value.id : ""),
        { method: value ? "PATCH" : "POST", body },
      );
      saved(result);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        value
          ? task
            ? "Редактировать задание"
            : "Редактировать предмет"
          : task
            ? "Новое задание"
            : "Новый предмет"
      }
      close={close}
      busy={busy}
    >
      <ErrorBox message={error} />
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <Field label={task ? "Название задания" : "Название предмета"}>
            <input
              autoFocus
              name={task ? "title" : "name"}
              defaultValue={value?.title || value?.name || ""}
              required
              maxLength={task ? 200 : 100}
              onChange={requiredTrim}
              placeholder={task ? "Что нужно сделать?" : "Например, математика"}
            />
          </Field>
          <Field label="Описание">
            <textarea
              name="description"
              defaultValue={value?.description || ""}
              maxLength={10000}
              rows={3}
              placeholder="Детали, которые помогут не забыть важное"
            />
          </Field>
          {task && (
            <>
              <Field label="Предмет">
                <select
                  name="subject_id"
                  defaultValue={value?.subject_id || subjects[0]?.id}
                  required
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Дедлайн">
                  <input
                    type="datetime-local"
                    name="due_at"
                    required
                    defaultValue={localDate(value?.due_at)}
                  />
                </Field>
                <Field label="Приоритет">
                  <select
                    name="priority"
                    defaultValue={value?.priority || "medium"}
                  >
                    {Object.entries(priorities).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="hint">
                Время указано в часовом поясе устройства. Прошедший дедлайн
                допустим.
              </p>
            </>
          )}
          <div className="modal-actions">
            <button type="button" onClick={close}>
              Отмена
            </button>
            <button className="primary" type="submit">
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export function DeleteDialog({ title, path, close, saved, detail }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "DELETE" });
      saved();
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={"Удалить «" + title + "»?"} close={close} busy={busy}>
      <p className="muted">{detail || "Это действие нельзя отменить."}</p>
      <ErrorBox message={error} />
      <div className="modal-actions">
        <button disabled={busy} onClick={close}>
          Отмена
        </button>
        <button className="danger" disabled={busy} onClick={remove}>
          {busy ? "Удаляем…" : "Удалить"}
        </button>
      </div>
    </Modal>
  );
}
