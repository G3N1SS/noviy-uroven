/**
 * Генератор иконок PWA (Этап 5). Проект принципиально zero-asset — вся графика
 * процедурная, — поэтому и иконки не лежат бинарями в репозитории, а рисуются этим
 * скриптом: чистый Node (zlib из стандартной библиотеки), никаких image-зависимостей.
 *
 *   node scripts/gen-icons.mjs
 *
 * Знак: три шеврона вверх («сигнал берёт новый уровень») на чёрном. Верхний — маджента
 * (акцент), два нижних — белые: фирстиль T2 разрешает магенту только как акцент-заливку,
 * текст и знаки — Ч/Б. Жёлтого нет нигде.
 *
 * maskable-вариант рисуется мельче: Android обрезает иконку под форму launcher'а, знак
 * должен уместиться в безопасную зону (центральные ~80% полотна).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BLACK = [0x00, 0x00, 0x00]
const WHITE = [0xff, 0xff, 0xff]
const MAGENTA = [0xff, 0x34, 0x95]

// --- PNG (RGBA8, без интерлейса) ---

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba: Uint8Array размера size*size*4 → буфер PNG. */
function encodePng(rgba, size) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter type 0 (None)
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // бит на канал
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- знак ---

/**
 * Покрытие шеврона в точке (координаты 0..1 от полотна).
 * Шеврон — «галочка» вверх: две руки от вершины вниз-вбок, толщина t.
 */
function inChevron(x, y, { cx, apexY, halfWidth, slope, thickness }) {
  const dx = Math.abs(x - cx)
  if (dx > halfWidth) return false
  const armY = apexY + dx * slope // y средней линии руки на этом dx
  return Math.abs(y - armY) <= thickness / 2
}

/** Три шеврона стопкой: верхний маджента, два нижних белые. `scale` — доля полотна. */
function markLayers(scale) {
  const step = 0.16 * scale
  const base = {
    cx: 0.5,
    halfWidth: 0.3 * scale,
    slope: 0.62,
    thickness: 0.1 * scale,
  }
  // Шевроны растут вниз (руки уходят от вершины), поэтому вершину поднимаем: иначе знак
  // визуально валится к нижнему краю. Сдвиг подобран так, чтобы центр массы был в центре.
  const topY = 0.5 - step - 0.085 * scale
  return [
    { ...base, apexY: topY, color: MAGENTA },
    { ...base, apexY: topY + step, color: WHITE },
    { ...base, apexY: topY + step * 2, color: WHITE },
  ]
}

/** Отрисовать иконку size×size. maskable → знак мельче (безопасная зона launcher'а). */
function renderIcon(size, maskable) {
  const rgba = new Uint8Array(size * size * 4)
  const layers = markLayers(maskable ? 0.72 : 1)
  const SS = 3 // суперсэмплинг: сглаженные края без графической библиотеки

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hitR = 0
      let hitG = 0
      let hitB = 0
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          // Верхний слой рисуется поверх — идём с конца, первый попавшийся выигрывает.
          for (const l of layers) {
            if (inChevron(x, y, l)) {
              hitR += l.color[0]
              hitG += l.color[1]
              hitB += l.color[2]
              hits++
              break
            }
          }
        }
      }
      const total = SS * SS
      const a = hits / total
      const i = (py * size + px) * 4
      // Смешиваем средний цвет знака с чёрным фоном по покрытию — это и есть сглаживание.
      rgba[i] = Math.round((hits ? hitR / hits : 0) * a + BLACK[0] * (1 - a))
      rgba[i + 1] = Math.round((hits ? hitG / hits : 0) * a + BLACK[1] * (1 - a))
      rgba[i + 2] = Math.round((hits ? hitB / hits : 0) * a + BLACK[2] * (1 - a))
      rgba[i + 3] = 255 // фон непрозрачный: maskable требует полного полотна
    }
  }
  return encodePng(rgba, size)
}

mkdirSync(OUT_DIR, { recursive: true })
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]
for (const [name, size, maskable] of targets) {
  const png = renderIcon(size, maskable)
  writeFileSync(join(OUT_DIR, name), png)
  console.log(`${name}: ${size}×${size}, ${(png.length / 1024).toFixed(1)} КБ`)
}
