/**
 * Схема бэкенда (Этап 6, конспект 4.6). Один SQL-диалект (PostgreSQL) на оба драйвера:
 * Neon в проде и pglite (Postgres в WASM) в dev/тестах — поэтому DDL живёт строкой здесь,
 * а не .sql-файлом (serverless-функции не читают файлы с диска надёжно).
 *
 * Всё через `IF NOT EXISTS`: `ensureSchema()` идемпотентна, её можно звать на каждом
 * холодном старте функции без миграционного рантайма (масштаб проекта того не требует).
 *
 * Идентичность игрока — анонимный `playerId` (UUID с клиента). Реальный аккаунт по T2 SSO
 * придёт на Этапе 7 и сольётся с анонимным по этому же id — сейчас без регистрации.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS players (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  city            TEXT,
  best_height     INTEGER NOT NULL DEFAULT 0,
  crystals        INTEGER NOT NULL DEFAULT 0,
  crystals_earned INTEGER NOT NULL DEFAULT 0,
  crystals_spent  INTEGER NOT NULL DEFAULT 0,
  games_played    INTEGER NOT NULL DEFAULT 0,
  flagged         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL REFERENCES players(id),
  height        INTEGER NOT NULL,
  crystals      INTEGER NOT NULL,
  epoch         INTEGER NOT NULL,
  boosters_used JSONB NOT NULL DEFAULT '[]',
  events        JSONB,
  valid         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    BIGINT NOT NULL,
  synced_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player_idx ON sessions (player_id);
CREATE INDEX IF NOT EXISTS sessions_height_idx ON sessions (height DESC);
CREATE INDEX IF NOT EXISTS sessions_created_idx ON sessions (created_at);

CREATE TABLE IF NOT EXISTS redemptions (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players(id),
  reward_id  TEXT NOT NULL,
  cost       INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);
`
