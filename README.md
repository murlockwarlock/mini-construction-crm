# Мини-CRM «Объекты и задачи»

## Запуск

```bash
npm ci
cp .env.example .env
npm run dev
```

## Конфигурация

В `.env` укажите URL Supabase и publishable key. Файл игнорируется Git.
Service role key frontend не нужен. Шаблоны окружения содержат placeholders.

## Миграции

Схема хранится только в `supabase/migrations`; облачную базу нельзя сбрасывать.
После зелёного CI оператор применяет миграцию к единственному проекту:

```bash
supabase link --project-ref replace-with-project-ref
supabase db push
```

## Проверки

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

GitHub Actions выполняет чистые миграции настоящего PostgreSQL, pgTAP, API security с JWT, build, Playwright, accessibility, responsive, network
и визуальные проверки. SQLite и имитации PostgreSQL не используются.
Playwright прикладывает реальные post-login скриншоты к CI-артефакту.

## Деплой

Деплой не выполняется CI и не выполняется на этом этапе.

```bash
cp deploy/.env.example deploy/.env
./scripts/deploy.sh --main
./scripts/deploy.sh --rollback
```

`deploy/.env` и SSH-ключ не коммитятся. Скрипт проверяет точный SHA и обязательные зелёные jobs. Rollback использует предыдущий release на сервере
и не требует локальной Git-копии или Supabase-конфигурации.
