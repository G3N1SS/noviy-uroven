# Новый уровень

Веб-игра (PWA) для оператора **T2** — бесконечный вертикальный климбер в стиле Doodle Jump.
Персонаж-«сигнал» прыгает по вышкам связи вверх через эпохи сетей 2G → 6G.

> «Другие правила. Новый уровень».

Полный контекст проекта — в [`docs/t2_novy_uroven_master_konspekt.md`](docs/t2_novy_uroven_master_konspekt.md).
Рабочие правила для Claude Code — в [`CLAUDE.md`](CLAUDE.md).

## Стек

React 18 + TypeScript 5 (strict) + Vite 5 · PixiJS 8 (WebGL) · Matter.js · Zustand · PWA (Workbox) · IndexedDB

## Команды

```bash
npm install       # установка зависимостей
npm run dev       # dev-сервер (http://localhost:5173, доступен по сети — тюнинг на телефоне)
npm run build     # прод-сборка (tsc --noEmit + vite build)
npm run preview   # предпросмотр прод-сборки
npm run lint      # ESLint
npm run format    # Prettier
```

## Работа с 3 устройств

Сел за устройство — `git pull`. Встал — `git add . && git commit && git push`.
Не оставлять несинхронизированным.

## Статус

Этап 0 (Фундамент) — каркас проекта, Pixi-рендер поднят. Следующий — Этап 1 (кайфовый прыжок).
Числа игры — только в [`src/game/config/balance.json`](src/game/config/balance.json).
