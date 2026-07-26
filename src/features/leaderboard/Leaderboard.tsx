import { useEffect, useState } from 'react'
import './leaderboard.css'
import { useUi } from '../../shared/store/ui'
import { getBestHeight, getDisplayName } from '../../shared/storage/local'
import { ensurePlayerId } from '../../shared/net/identity'
import {
  fetchLeaderboard,
  type LbScope,
  type LbPeriod,
  type LeaderboardResult,
} from '../../shared/net/api'

/**
 * Лидерборд (ТЗ 3.5, Этап 6). «Мир» — реальные данные с бэкенда (недельный топ + за всё
 * время), своя позиция даже вне топ-100. «Город»/«Друзья» — честные заглушки: друзьям нужен
 * граф из T2 SSO (Этап 7), городу — сбор города. Офлайн — не врём: показываем локальный
 * рекорд и статус «нет сети».
 */

type Status = 'loading' | 'ok' | 'offline'

const TABS: Array<{ scope: LbScope; label: string }> = [
  { scope: 'global', label: 'Мир' },
  { scope: 'city', label: 'Город' },
  { scope: 'friends', label: 'Друзья' },
]

export function Leaderboard() {
  const backToMenu = useUi((s) => s.backToMenu)
  const [scope, setScope] = useState<LbScope>('global')
  const [period, setPeriod] = useState<LbPeriod>('week')
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<LeaderboardResult | null>(null)

  const playerId = ensurePlayerId()
  const displayName = getDisplayName() || 'Ты'
  const localBest = getBestHeight()

  useEffect(() => {
    let alive = true
    setStatus('loading')
    fetchLeaderboard({ scope, period, playerId })
      .then((res) => {
        if (!alive) return
        setData(res)
        setStatus('ok')
      })
      .catch(() => {
        if (!alive) return
        setStatus('offline')
      })
    return () => {
      alive = false
    }
  }, [scope, period, playerId])

  const myRank = data?.me?.rank ?? null
  const myHeight = data?.me?.height ?? localBest

  return (
    <div className="lb">
      <div className="lb__header">
        <button className="lb__back" aria-label="Назад" onClick={backToMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="lb__title">Лидерборд</h1>
      </div>

      <div className="lb__tabs">
        {TABS.map((t) => (
          <button
            key={t.scope}
            className={`lb__tab${scope === t.scope ? ' lb__tab--active' : ''}`}
            onClick={() => setScope(t.scope)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope === 'global' && (
        <div className="lb__toggle">
          <button
            className={`lb__seg${period === 'week' ? ' lb__seg--active' : ''}`}
            onClick={() => setPeriod('week')}
          >
            Неделя
          </button>
          <button
            className={`lb__seg${period === 'all' ? ' lb__seg--active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            Всё время
          </button>
        </div>
      )}

      {/* Карточка «ТЫ»: ник + позиция + рекорд периода (офлайн — локальный рекорд) */}
      <div className="lb__card--you">
        <div className="lb__you-badge">{myRank ? `#${myRank}` : 'ТЫ'}</div>
        <div className="lb__you-main">
          <div className="lb__you-nick">{displayName}</div>
          <div className="lb__height">
            <span className="lb__height-value">{myHeight}</span>
            <span className="lb__height-unit">м</span>
          </div>
        </div>
        {status === 'offline' && <div className="lb__you-tag">нет сети</div>}
      </div>

      <LeaderboardBody
        scope={scope}
        status={status}
        data={data}
        playerId={playerId}
        localBest={localBest}
      />
    </div>
  )
}

function LeaderboardBody({
  scope,
  status,
  data,
  playerId,
  localBest,
}: {
  scope: LbScope
  status: Status
  data: LeaderboardResult | null
  playerId: string
  localBest: number
}) {
  if (status === 'loading') {
    return <div className="lb__state">Загружаем топ…</div>
  }

  if (status === 'offline') {
    return (
      <Placeholder
        title="Нет сети"
        desc="Топ подтянется, как появится связь. Твой рекорд уже сохранён и уедет в зачёт."
        status={`Локальный рекорд: ${localBest} м`}
        pulse
      />
    )
  }

  if (scope === 'friends' || (data && !data.supported)) {
    return (
      <Placeholder
        title="Друзья — скоро"
        desc="Подключим, когда войдёшь по номеру T2. Тогда увидишь, кто из своих выше."
        status="Ждёт входа T2"
        pulse
      />
    )
  }

  if (scope === 'city') {
    return (
      <Placeholder
        title="Город — скоро"
        desc="Скоро можно будет мериться высотой со своим городом."
        status="В разработке"
        pulse
      />
    )
  }

  const entries = data?.entries ?? []
  if (entries.length === 0) {
    return (
      <Placeholder
        title="Пока пусто"
        desc="Топ этой недели ещё не собран. Сыграй — и займёшь первую строчку."
        status="Будь первым"
      />
    )
  }

  return (
    <div className="lb__list">
      {entries.map((e) => (
        <div
          key={e.playerId}
          className={`lb__row${e.playerId === playerId ? ' lb__row--me' : ''}`}
        >
          <span className={`lb__rank${e.rank <= 3 ? ' lb__rank--top' : ''}`}>{e.rank}</span>
          <span className="lb__name">{e.name}</span>
          <span className="lb__row-height">
            {e.height}
            <span className="lb__row-unit"> м</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Placeholder({
  title,
  desc,
  status,
  pulse = false,
}: {
  title: string
  desc: string
  status: string
  pulse?: boolean
}) {
  return (
    <div className="lb__world">
      <div className="lb__world-icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </svg>
      </div>
      <div className="lb__world-title">{title}</div>
      <div className="lb__world-desc">{desc}</div>
      <div className="lb__world-status">
        {pulse && <span className="lb__pulse" aria-hidden="true" />}
        {status}
      </div>
    </div>
  )
}
