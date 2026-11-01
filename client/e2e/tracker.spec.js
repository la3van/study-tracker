import { test, expect } from "@playwright/test";

const password = "Study-password-123";
async function register(page) {
  const email = "test-" + crypto.randomUUID() + "@example.com";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Тестовый студент");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Аккаунт создан");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Мои задания." }),
  ).toBeVisible();
  return email;
}

async function addSubject(page, name = "Математика") {
  await page.getByRole("button", { name: "Предметы", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Новый предмет", exact: true })
    .click();
  await page.getByLabel("Название предмета").fill(name);
  await page.getByLabel("Описание", { exact: true }).fill("Первый семестр");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("Полный сценарий: регистрация, предмет, задание, чек-лист, фильтры, статистика и выход", async ({
  page,
  request,
}) => {
  const email = await register(page);
  await addSubject(page);
  await page.getByRole("button", { name: "Мои задания", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Новое задание", exact: true })
    .click();
  await page.getByLabel("Название задания").fill("Решить интегралы");
  await page
    .getByLabel("Описание", { exact: true })
    .fill("Задачи 1–5 из семинара");
  await page.getByLabel("Дедлайн", { exact: true }).fill("2030-12-10T18:00");
  await page.getByLabel("Приоритет", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("heading", { name: "Решить интегралы", exact: true })
    .click();
  await page
    .getByLabel("Новый пункт", { exact: true })
    .fill("Прочитать конспект");
  await page
    .getByRole("button", { name: "Добавить пункт", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Прочитать конспект" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Прочитать конспект" }),
  ).toBeChecked();
  await expect(page.getByLabel("Статус задания")).toHaveValue("todo");
  await page
    .getByRole("button", { name: "Редактировать пункт Прочитать конспект" })
    .click();
  await page.getByLabel("Текст пункта").fill("Повторить конспект");
  await page.getByLabel("Порядок пункта").fill("2");
  await page.getByRole("button", { name: "Сохранить пункт" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Повторить конспект" }),
  ).toBeChecked();
  await page.getByLabel("Статус задания").selectOption("done");
  await expect(page.getByText("Завершено", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Мои задания." }),
  ).toBeVisible();
  await page.getByLabel("Поиск заданий").fill("интегралы");
  await page.getByLabel("Фильтр по статусу").selectOption("done");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Решить интегралы", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(() =>
    sessionStorage.getItem("study-token"),
  );
  const headers = { Authorization: "Bearer " + token };
  const tasks = await (await request.get("/api/v1/tasks", { headers })).json();
  expect(tasks.total).toBe(1);
  expect(tasks.items[0].status).toBe("done");
  expect(tasks.items[0].completed_at).toBeTruthy();
  const items = await (
    await request.get("/api/v1/tasks/" + tasks.items[0].id + "/checklist", {
      headers,
    })
  ).json();
  expect(items.items[0].title).toBe("Повторить конспект");
  expect(items.items[0].is_completed).toBe(true);
  await page
    .getByRole("heading", { name: "Решить интегралы", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  await page.getByLabel("Название задания").fill("Интегралы готовы");
  await page.getByLabel("Дедлайн", { exact: true }).fill("2020-01-01T12:00");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByLabel("Статус задания").selectOption("in_progress");
  await expect(page.getByLabel("Статус задания")).toHaveValue("in_progress");
  await page
    .getByRole("button", { name: "Удалить пункт Повторить конспект" })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await page.getByLabel("Фильтр по дедлайну").selectOption("overdue");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Интегралы готовы", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Предметы", exact: true }).click();
  await page
    .getByRole("button", { name: "Удалить предмет Математика" })
    .click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  await page.getByLabel("Название предмета").fill("Высшая математика");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Высшая математика", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Мои задания", exact: true }).click();
  await page
    .getByRole("heading", { name: "Интегралы готовы", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Удалить задание", exact: true })
    .click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Интегралы готовы", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Предметы", exact: true }).click();
  await page
    .getByRole("button", { name: "Удалить предмет Высшая математика" })
    .click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "С чего начнём?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "С возвращением" }),
  ).toBeVisible();
  expect((await request.get("/api/v1/tasks", { headers })).status()).toBe(401);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Мои задания." }),
  ).toBeVisible();
});

test("Ошибки сети, восстановление, загрузка, валидация и истечение сессии", async ({
  page,
  request,
}) => {
  await register(page);
  await addSubject(page);
  await page.getByRole("button", { name: "+ Новый предмет" }).click();
  await page.getByLabel("Название предмета").fill("   ");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByLabel("Название предмета")
      .evaluate((el) => el.validity.valid),
  ).toBe(false);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.route("**/api/v1/tasks?*", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Мои задания", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось связаться");
  await page.unroute("**/api/v1/tasks?*");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/tasks?*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Загружаем" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "Здесь пока ничего нет" }),
  ).toBeVisible();
  await page.unroute("**/api/v1/tasks?*");
  const token = await page.evaluate(() =>
    sessionStorage.getItem("study-token"),
  );
  await request.post("/api/v1/auth/logout", {
    headers: { Authorization: "Bearer " + token },
  });
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "С возвращением" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("missing@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("Мобильный экран без горизонтальной прокрутки", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await addSubject(page, "Распределённые системы");
  await expect(
    page.getByRole("heading", { name: "Распределённые системы", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Пагинация и ближайшие дедлайны с совместными фильтрами", async ({
  page,
  request,
}) => {
  await register(page);
  await addSubject(page, "Алгоритмы");
  const token = await page.evaluate(() =>
    sessionStorage.getItem("study-token"),
  );
  const headers = { Authorization: "Bearer " + token };
  const subject = (
    await (await request.get("/api/v1/subjects", { headers })).json()
  ).items[0];
  for (let i = 0; i < 13; i++) {
    const response = await request.post("/api/v1/tasks", {
      headers,
      data: {
        subject_id: subject.id,
        title: "Задача " + String(i + 1).padStart(2, "0"),
        due_at: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
        priority: i < 2 ? "high" : "medium",
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.getByRole("button", { name: "Мои задания", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Следующая страница" }).click();
  await expect(page.locator(".task-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Задача 13", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Фильтр по дедлайну").selectOption("upcoming");
  await page.getByLabel("Число дней").fill("7");
  await page.getByLabel("Фильтр по приоритету").selectOption("high");
  await page.getByLabel("Фильтр по предмету").selectOption(subject.id);
  await page.getByLabel("Порядок сортировки").selectOption("desc");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(2);
  await expect(page.locator(".task-card").first()).toContainText("Задача 02");
  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
});
