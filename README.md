# Мини-CRM «Объекты и задачи»

Мини-CRM для строительной компании: объекты, задачи, исполнители, статусы и история действий.

## Локальный запуск

```bash
npm ci
cp .env.example .env
npm run dev
```

В `.env` нужны `VITE_SUPABASE_URL` и publishable key Supabase. Service-role ключ во frontend не используется и в репозитории не хранится.

## Рабочий процесс

- Постановщик управляет объектами и задачами, видит общий раздел «Задачи», фильтры, список или канбан и принимает результат.
- Исполнитель начинает назначенную задачу, отправляет её на проверку и видит только свои рабочие задачи.
- Доступные переходы статусов выполняются через серверные RPC. Возврат на доработку требует комментария.
- Удалённые записи скрыты из рабочих списков. История действий сохраняется для аудита.
- История и комментарии отображаются в карточке задачи. Комментарии хранятся отдельно от неизменяемой истории статусов.

## Проверки

Быстрые локальные проверки:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Полный CI запускает изолированный PostgreSQL/Supabase, применяет миграции на тестовой базе, выполняет pgTAP, API security с JWT, Playwright, accessibility, responsive, network и visual checks.

## Миграции

Миграции находятся в `supabase/migrations`. Новая миграция `20261105000000_task_comments_and_activity_order.sql` добавляет порядок активности и отдельные комментарии с RLS.

Для локальной disposable-базы:

```bash
supabase start
supabase db reset --no-seed
supabase test db
```

Для облачного проекта миграции применяются отдельно после успешного CI штатной командой Supabase. `scripts/deploy.sh` не изменяет базу данных.

## Деплой frontend

Preview выполняется из чистой feature-ветки без merge и CI:

```bash
cp deploy/.env.example deploy/.env
./scripts/deploy.sh --preview
```

Финальный deploy разрешён только для точного CI-проверенного `main`:

```bash
./scripts/deploy.sh --main
./scripts/deploy.sh --rollback
```

Деплой собирает frontend, создаёт release с точным SHA, атомарно переключает `current`, сохраняет предыдущие releases и проверяет `/login` и `manifest.json`. `deploy/.env`, `.env` и SSH-ключи не коммитятся.
