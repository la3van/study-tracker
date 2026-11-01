import { cloneElement, useEffect, useId, useRef, useState } from "react";

export const statuses = {
  todo: "Не начато",
  in_progress: "В работе",
  done: "Выполнено",
};
export const priorities = { low: "Низкий", medium: "Средний", high: "Высокий" };

export function dateLabel(value) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function localDate(value) {
  const d = value ? new Date(value) : new Date(Date.now() + 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function ErrorBox({ message, retry }) {
  return message ? (
    <div className="error" role="alert">
      <span>{message}</span>
      {retry && <button onClick={retry}>Повторить</button>}
    </div>
  ) : null;
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Загружаем данные…
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">✓</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function useResource(loader, dependencies) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ data: null, loading: true, error: "" });
    loader(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError")
          setState({ data: null, loading: false, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [...dependencies, retry]);
  return { ...state, reload: () => setRetry((n) => n + 1) };
}

export function Modal({ title, children, close, busy = false }) {
  const ref = useRef(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) closeRef.current();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Закрыть"
          onClick={close}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Pager({ page, total, pageSize = 12, change }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>Всего: {total}</span>
      <div>
        <button
          disabled={page <= 1}
          onClick={() => change(page - 1)}
          aria-label="Предыдущая страница"
        >
          ←
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => change(page + 1)}
          aria-label="Следующая страница"
        >
          →
        </button>
      </div>
    </div>
  );
}

export function requiredTrim(event) {
  event.target.setCustomValidity(
    event.target.value.trim() ? "" : "Введите текст, а не только пробелы.",
  );
}

export function Field({ label, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
