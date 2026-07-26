/**
 * Валидатор ника на клиенте (Этап 6) — для мгновенного UX в настройках. Сервер валидирует
 * независимо (граница доверия), правила совпадают: убрать управляющие символы, схлопнуть
 * пробелы, длина 2..16.
 */
export const NAME_MIN = 2
export const NAME_MAX = 16

/** Нормализованный ник или null, если слишком короткий/пустой. */
export function sanitizeName(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length < NAME_MIN) return null
  return cleaned.slice(0, NAME_MAX)
}
