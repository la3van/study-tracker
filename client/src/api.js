export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  return sessionStorage.getItem("study-token");
}

export function setToken(token) {
  if (token) sessionStorage.setItem("study-token", token);
  else sessionStorage.removeItem("study-token");
}

export async function api(path, { method = "GET", body, signal } = {}) {
  const token = getToken();
  let response;
  try {
    response = await fetch("/api/v1" + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      "Не удалось связаться с сервером. Проверьте соединение и повторите запрос.",
      0,
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("session-expired"));
    }
    throw new ApiError(
      data?.error?.message ||
        "Сервер не смог выполнить запрос. Попробуйте ещё раз.",
      response.status,
    );
  }
  return response.status === 204 ? null : response.json();
}

export async function allPages(path, signal) {
  let page = 1;
  const items = [];
  while (true) {
    const result = await api(path + "?page_size=100&page=" + page, { signal });
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) return items;
    page++;
  }
}
