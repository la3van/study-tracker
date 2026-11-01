import { useState } from "react";
import { api } from "./api";
import { useResource, Loading, ErrorBox, Empty, Pager } from "./shared";
import { DeleteDialog, Editor } from "./Editors";

export default function Subjects({ revision, changed }) {
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const resource = useResource(
    (signal) => api("/subjects?page_size=12&page=" + page, { signal }),
    [page, revision],
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">ВСЁ НА СВОИХ МЕСТАХ</span>
          <h1>
            Предметы<span className="title-dot">.</span>
          </h1>
          <p className="muted">Разделите учебные планы по направлениям.</p>
        </div>
        <button className="primary" onClick={() => setEditor({})}>
          + Новый предмет
        </button>
      </div>
      {resource.loading && <Loading />}
      <ErrorBox message={resource.error} retry={resource.reload} />
      {resource.data && (
        <>
          {resource.data.items.length ? (
            <div className="subject-grid">
              {resource.data.items.map((s, index) => (
                <article className="subject-card" key={s.id}>
                  <span className={"subject-monogram tone-" + (index % 4)}>
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                  <h3>{s.name}</h3>
                  <p>{s.description || "Описание пока не добавлено."}</p>
                  <div className="subject-actions">
                    <button onClick={() => setEditor(s)}>Редактировать</button>
                    <button
                      className="text-danger"
                      onClick={() => setDeleting(s)}
                      aria-label={"Удалить предмет " + s.name}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="С чего начнём?">
              Добавьте первый предмет, чтобы создавать задания.
            </Empty>
          )}
          <Pager page={page} total={resource.data.total} change={setPage} />
        </>
      )}
      {editor && (
        <Editor
          kind="subject"
          value={editor.id ? editor : null}
          close={() => setEditor(null)}
          saved={changed}
        />
      )}
      {deleting && (
        <DeleteDialog
          title={deleting.name}
          path={"/subjects/" + deleting.id}
          close={() => setDeleting(null)}
          saved={() => {
            if (resource.data.items.length === 1 && page > 1) setPage(page - 1);
            changed();
          }}
          detail="Можно удалить только предмет без заданий. Сначала удалите или перенесите его задания."
        />
      )}
    </>
  );
}
