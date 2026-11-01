import { useState } from "react";
import { api } from "./api";
import {
  useResource,
  Loading,
  ErrorBox,
  Empty,
  Pager,
  statuses,
  priorities,
  dateLabel,
} from "./shared";

const defaults = {
  q: "",
  subject_id: "",
  status: "",
  priority: "",
  deadline: "",
  days: "7",
  sort: "due_at",
  order: "asc",
};

export default function Tasks({ subjects, revision, open, create, ready }) {
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
    page,
    page_size: 12,
  }).toString();
  const resource = useResource(
    (signal) => api("/tasks?" + query, { signal }),
    [query, revision],
  );
  const update = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  function reset() {
    setDraft(defaults);
    setFilters(defaults);
    setPage(1);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">ШАГ ЗА ШАГОМ</span>
          <h1>
            Мои задания<span className="title-dot">.</span>
          </h1>
          <p className="muted">
            Большие планы начинаются с одного небольшого дела.
          </p>
        </div>
        <button className="primary" disabled={!ready} onClick={create}>
          + Новое задание
        </button>
      </div>
      {ready && !subjects.length && (
        <p className="notice">
          Сначала добавьте предмет. Кнопка «Новое задание» откроет форму его
          создания.
        </p>
      )}
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft, q: draft.q.trim() });
          setPage(1);
        }}
      >
        <div className="filter-top">
          <input
            aria-label="Поиск заданий"
            placeholder="Поиск по названию или описанию…"
            maxLength={200}
            value={draft.q}
            onChange={(e) => update("q", e.target.value)}
          />
          <button type="submit">Найти</button>
          <button type="button" className="text-button" onClick={reset}>
            Сбросить
          </button>
        </div>
        <div className="filter-grid">
          <select
            aria-label="Фильтр по предмету"
            value={draft.subject_id}
            onChange={(e) => update("subject_id", e.target.value)}
          >
            <option value="">Все предметы</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Фильтр по статусу"
            value={draft.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="">Все статусы</option>
            {Object.entries(statuses).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Фильтр по приоритету"
            value={draft.priority}
            onChange={(e) => update("priority", e.target.value)}
          >
            <option value="">Любой приоритет</option>
            {Object.entries(priorities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Фильтр по дедлайну"
            value={draft.deadline}
            onChange={(e) => update("deadline", e.target.value)}
          >
            <option value="">Все дедлайны</option>
            <option value="overdue">Просроченные</option>
            <option value="upcoming">Ближайшие</option>
          </select>
          {draft.deadline === "upcoming" && (
            <label className="days">
              Дней
              <input
                aria-label="Число дней"
                type="number"
                min={1}
                max={30}
                required
                value={draft.days}
                onChange={(e) => update("days", e.target.value)}
              />
            </label>
          )}
          <select
            aria-label="Сортировка"
            value={draft.sort}
            onChange={(e) => update("sort", e.target.value)}
          >
            <option value="due_at">По дедлайну</option>
            <option value="priority">По приоритету</option>
            <option value="created_at">По дате создания</option>
          </select>
          <select
            aria-label="Порядок сортировки"
            value={draft.order}
            onChange={(e) => update("order", e.target.value)}
          >
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
        </div>
        <p className="hint">Выберите фильтры и нажмите «Найти».</p>
      </form>
      {resource.loading && <Loading />}
      <ErrorBox message={resource.error} retry={resource.reload} />
      {resource.data && (
        <>
          <div className="list-heading">
            <span>ВАШ ПЛАН</span>
            <span>{resource.data.total} заданий</span>
          </div>
          {resource.data.items.length ? (
            <div className="task-grid">
              {resource.data.items.map((task) => {
                const overdue =
                  task.status !== "done" && new Date(task.due_at) < new Date();
                return (
                  <button
                    key={task.id}
                    className={
                      "task-card " + (task.status === "done" ? "finished" : "")
                    }
                    onClick={() => open(task.id)}
                  >
                    <div className="card-top">
                      <span className="subject-label">
                        {subjects.find((s) => s.id === task.subject_id)?.name ||
                          "Предмет"}
                      </span>
                      <span className={"badge " + task.priority}>
                        {priorities[task.priority]}
                      </span>
                    </div>
                    <h3>{task.title}</h3>
                    <p>{task.description || "Без описания"}</p>
                    <div className="card-footer">
                      <span className={overdue ? "overdue" : ""}>
                        {overdue ? "↗ Просрочено · " : ""}
                        {dateLabel(task.due_at)}
                      </span>
                      <span className={"status " + task.status}>
                        {statuses[task.status]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty title="Здесь пока ничего нет">
              {resource.data.total
                ? "На этой странице нет заданий. Вернитесь на предыдущую."
                : "Создайте задание или измените условия поиска."}
            </Empty>
          )}
          <Pager page={page} total={resource.data.total} change={setPage} />
        </>
      )}
    </>
  );
}
