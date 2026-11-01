import { api } from "./api";
import { useResource, Loading, ErrorBox } from "./shared";

export default function Stats({ revision, compact = false }) {
  const resource = useResource(
    (signal) => api("/stats", { signal }),
    [revision],
  );
  const data = resource.data;
  return (
    <section aria-label="Статистика">
      {!compact && (
        <div className="section-heading">
          <div>
            <span className="eyebrow">ТВОЙ РИТМ</span>
            <h1>
              Прогресс<span className="title-dot">.</span>
            </h1>
            <p className="muted">
              Посмотрите, сколько уже позади и что требует внимания.
            </p>
          </div>
        </div>
      )}
      {resource.loading && <Loading />}
      <ErrorBox message={resource.error} retry={resource.reload} />
      {data && (
        <>
          <div className="stats-grid">
            {[
              ["Всего заданий", data.total, "Все учебные планы"],
              ["В работе", data.in_progress, "Двигаемся к результату"],
              ["Выполнено", data.done, "Есть повод гордиться"],
              ["Просрочено", data.overdue, "Стоит уделить внимание"],
            ].map(([label, value, hint], i) => (
              <div key={label} className={"stat-card stat-" + i}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{hint}</small>
              </div>
            ))}
          </div>
          {!compact && (
            <div className="progress-card">
              <div className="progress-heading">
                <div>
                  <h2>Каждое задание считается</h2>
                  <p className="muted">
                    Выполнено {data.done} из {data.total} заданий
                  </p>
                </div>
                <strong>{data.completed_percent}%</strong>
              </div>
              <progress
                max={100}
                value={data.completed_percent}
                aria-label="Процент выполненных заданий"
              />
              <div className="progress-legend">
                <span>Не начато: {data.todo}</span>
                <span>В работе: {data.in_progress}</span>
                <span>Выполнено: {data.done}</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
