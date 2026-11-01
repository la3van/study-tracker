import { useState } from "react";
import { api, setToken } from "./api";
import { ErrorBox, Field, requiredTrim } from "./shared";

export default function Auth({ onLogin, notice = "" }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(notice);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const body = {
        email: form.get("email").trim(),
        password: form.get("password"),
      };
      if (register) {
        await api("/auth/register", {
          method: "POST",
          body: { ...body, name: form.get("name").trim() },
        });
        setRegister(false);
        setMessage("Аккаунт создан. Войдите с вашим email и паролем.");
      } else {
        const result = await api("/auth/login", { method: "POST", body });
        setToken(result.access_token);
        onLogin(result.user);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">s.</span>study tracker
        </div>
        <div>
          <span className="eyebrow">МЕНЬШЕ ХАОСА. БОЛЬШЕ ЯСНОСТИ.</span>
          <h1>
            Учёба
            <br />
            по твоему
            <br />
            <em>плану.</em>
          </h1>
          <p>
            Предметы, дедлайны и маленькие шаги
            <br />к большим результатам — в одном месте.
          </p>
        </div>
        <div className="story-note">
          <span>01 /</span> Каждый выполненный пункт — уже прогресс.
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <span className="eyebrow">ТВОЁ УЧЕБНОЕ ПРОСТРАНСТВО</span>
          <h2>{register ? "Начнём с знакомства" : "С возвращением"}</h2>
          <p className="muted">
            {register
              ? "Создай аккаунт, чтобы сохранить свои планы."
              : "Войди, чтобы продолжить с того же места."}
          </p>
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <ErrorBox message={error} />
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {register && (
                <Field label="Имя">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    autoComplete="name"
                    onChange={requiredTrim}
                    placeholder="Как к тебе обращаться?"
                  />
                </Field>
              )}
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Пароль">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder="Не менее 8 символов"
                />
              </Field>
              <button className="primary wide" type="submit">
                {busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </fieldset>
          </form>
          <p className="auth-switch">
            {register ? "Уже есть аккаунт?" : "Первый раз здесь?"}{" "}
            <button
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setError("");
                setMessage("");
              }}
            >
              {register ? "Войти" : "Зарегистрироваться"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
