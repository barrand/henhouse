import type { GameData, RoundData, PlayerData, RoundResult } from '../types'
import { advanceRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

type ClusterType = 'flock' | 'outlier' | 'rotten' | 'no-answer'

interface AnswerCluster {
  answer: string
  playerIds: string[]
  type: ClusterType
}

const CLUSTER_STYLES: Record<ClusterType, {
  cardClass: string
  textClass: string
  henImg: string | null
  badge: string
  badgeClass: string
}> = {
  flock: {
    cardClass: 'bg-primary-fixed/10 border-2 border-primary',
    textClass: 'text-primary',
    henImg: '/images/generated-comic/hen-excited.png',
    badge: 'THE FLOCK',
    badgeClass: 'bg-primary text-on-primary',
  },
  outlier: {
    cardClass: 'bg-surface-container border border-outline-variant/60',
    textClass: 'text-on-surface',
    henImg: '/images/generated-comic/hen-sleeping.png',
    badge: 'MINORITY',
    badgeClass: 'bg-secondary-fixed text-on-secondary-fixed',
  },
  rotten: {
    cardClass: 'bg-error-container/10 border border-error/40',
    textClass: 'text-error',
    henImg: '/images/generated-comic/hen-embarrassed.png',
    badge: 'LONE −1',
    badgeClass: 'bg-error-container text-on-error-container',
  },
  'no-answer': {
    cardClass: 'bg-surface-container border border-outline-variant/60',
    textClass: 'text-on-surface-variant',
    henImg: null,
    badge: 'NO ANSWER',
    badgeClass: 'bg-surface-container-high text-on-surface-variant',
  },
}

function groupByAnswer(
  playerIds: string[],
  playerAnswers: Record<string, string>,
): { answer: string; playerIds: string[] }[] {
  const map = new Map<string, string[]>()
  for (const id of playerIds) {
    const answer = playerAnswers[id]?.trim() || '—'
    const list = map.get(answer) ?? []
    list.push(id)
    map.set(answer, list)
  }
  return [...map.entries()]
    .sort(([, a], [, b]) => b.length - a.length || a[0].localeCompare(b[0]))
    .map(([answer, ids]) => ({ answer, playerIds: ids }))
}

function buildClusters(
  results: Record<string, RoundResult>,
  playerAnswers: Record<string, string>,
): { clusters: AnswerCluster[]; noAnswerIds: string[] } {
  const answeredIds = Object.keys(results).filter(
    (id) => results[id] !== 'no-answer' && playerAnswers[id]?.trim(),
  )
  const noAnswerIds = Object.keys(results).filter((id) => results[id] === 'no-answer')

  const groups = groupByAnswer(answeredIds, playerAnswers)
  const clusters: AnswerCluster[] = groups.map(({ answer, playerIds }) => ({
    answer,
    playerIds,
    type: results[playerIds[0]] as ClusterType,
  }))

  const priority: Record<ClusterType, number> = { flock: 0, outlier: 1, rotten: 2, 'no-answer': 3 }
  clusters.sort((a, b) => {
    const pd = priority[a.type] - priority[b.type]
    return pd !== 0 ? pd : b.playerIds.length - a.playerIds.length
  })

  return { clusters, noAnswerIds }
}

export default function RevealBoard({ game, round, players, isHost, currentPlayerId }: Props) {
  const playerNameById = (id: string) => players.find((p) => p.id === id)?.name ?? id

  if (round.status === 'revealing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center space-y-3">
          <img src="/images/generated-comic/hen-pecking.png" alt="" className="w-20 h-20 mx-auto animate-hen-peck" />
          <p className="font-headline text-xl font-bold text-on-surface">Checking all answers...</p>
          <p className="text-outline text-sm font-body">The flock is being counted</p>
        </div>
      </div>
    )
  }

  const playerAnswers = round.playerAnswers ?? {}
  const results = round.results ?? {}
  const hasFlock = Object.values(results).some((r) => r === 'flock')
  const isLastRound = game.currentRound >= game.settings.totalRounds
  const yourResult = currentPlayerId ? results[currentPlayerId] : undefined
  const yourPoints = currentPlayerId ? (round.pointsThisRound?.[currentPlayerId] ?? 0) : 0
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const { clusters, noAnswerIds } = buildClusters(results, playerAnswers)

  const handleAdvance = async () => {
    try {
      await advanceRound(game.id)
    } catch (err) {
      console.error('Failed to advance:', err)
    }
  }

  const heroConfig = (() => {
    if (!yourResult) return null
    switch (yourResult) {
      case 'flock':
        return hasFlock
          ? { img: '/images/generated-comic/hen-excited.png', label: "You're in the flock!", points: '+1 pt' }
          : { img: '/images/generated-comic/hen-confused.png', label: 'No flock formed this round', points: null }
      case 'outlier':
        return hasFlock
          ? { img: '/images/generated-comic/hen-sleeping.png', label: 'You were in the minority', points: null }
          : { img: '/images/generated-comic/hen-confused.png', label: 'No flock formed this round', points: null }
      case 'rotten':
        return { img: '/images/generated-comic/hen-embarrassed.png', label: 'Lone odd one out', points: '−1 pt' }
      case 'no-answer':
        return { img: '/images/generated-comic/hen-sleeping.png', label: "You didn't answer in time", points: null }
      default:
        return null
    }
  })()

  const roundChip = (result: RoundResult | undefined, earned: number) => {
    if (result === 'flock' && earned > 0)
      return <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-primary-fixed">Flock +1</span>
    if (result === 'rotten' && earned < 0)
      return <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-error-container">Lone −1</span>
    if (result === 'no-answer')
      return <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">No answer</span>
    if (result === 'outlier')
      return <span className="rounded-full bg-secondary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-secondary-fixed">Minority</span>
    return null
  }

  const renderNameChips = (playerIds: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {playerIds.map((id) => {
        const isYou = id === currentPlayerId
        return (
          <span
            key={id}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium font-body ${
              isYou
                ? 'bg-primary/20 text-primary font-bold'
                : 'bg-surface-container-high text-on-surface'
            }`}
          >
            {playerNameById(id)}{isYou && ' ← you'}
          </span>
        )
      })}
    </div>
  )

  return (
    <div className="flex-1 px-4 py-6 space-y-5">
      {/* Question */}
      <div className="rounded-2xl border-2 p-5 text-center shadow-sm bg-surface-container-lowest border-outline-variant/60">
        <p className="font-headline text-xl font-bold text-on-surface leading-relaxed">{round.question}</p>
      </div>

      {/* Personal result hero */}
      {heroConfig && (
        <div className="flex flex-col items-center text-center py-2 space-y-3">
          <img src={heroConfig.img} alt="" className="w-32 h-32 animate-hen-pop" />
          <div className="space-y-1.5">
            <p className="font-headline text-2xl font-bold text-on-surface">{heroConfig.label}</p>
            {heroConfig.points && (
              <span className={`inline-block px-4 py-1 rounded-full text-sm font-bold font-body ${
                yourPoints > 0 ? 'bg-primary text-on-primary' : 'bg-error-container text-on-error-container'
              }`}>
                {heroConfig.points}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Unified answer board */}
      <section className="space-y-2">
        <h3 className="font-headline text-lg font-semibold text-primary px-1">Everyone's answers</h3>

        {clusters.map((cluster) => {
          const style = CLUSTER_STYLES[cluster.type]
          const isYourCluster = currentPlayerId ? cluster.playerIds.includes(currentPlayerId) : false
          return (
            <div
              key={cluster.answer}
              className={`rounded-2xl p-4 shadow-sm ${style.cardClass} ${isYourCluster ? 'ring-1 ring-primary/30' : ''}`}
            >
              <div className="flex items-center gap-3 mb-2.5">
                {style.henImg ? (
                  <img src={style.henImg} alt="" className="w-8 h-8 shrink-0" />
                ) : (
                  <div className="w-8 h-8 shrink-0" />
                )}
                <p className={`font-headline text-base font-bold flex-1 ${style.textClass}`}>{cluster.answer}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-on-surface-variant font-body">{cluster.playerIds.length} {cluster.playerIds.length === 1 ? 'player' : 'players'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badgeClass}`}>
                    {style.badge}
                  </span>
                </div>
              </div>
              {renderNameChips(cluster.playerIds)}
            </div>
          )
        })}

        {noAnswerIds.length > 0 && (
          <div className={`rounded-2xl p-4 shadow-sm ${CLUSTER_STYLES['no-answer'].cardClass}`}>
            <div className="flex items-center gap-3 mb-2.5">
              <div className="w-8 h-8 shrink-0" />
              <p className="font-headline text-base font-bold flex-1 text-on-surface-variant">No answer</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CLUSTER_STYLES['no-answer'].badgeClass}`}>
                TOO SLOW
              </span>
            </div>
            {renderNameChips(noAnswerIds)}
          </div>
        )}
      </section>

      {/* Standings */}
      <section>
        <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
          Standings
        </h3>
        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 divide-y divide-outline-variant/50 overflow-hidden">
          {sortedPlayers.map((player, i) => {
            const earned = round.pointsThisRound?.[player.id] ?? 0
            const isYou = player.id === currentPlayerId
            return (
              <li
                key={player.id}
                className={`px-3 py-2 font-body flex items-center gap-2 ${isYou ? 'bg-secondary-fixed/20' : ''}`}
              >
                <span className="text-outline w-5 tabular-nums shrink-0 text-sm">{i + 1}.</span>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="font-medium text-on-surface truncate">{player.name}</span>
                  {isYou && <span className="text-xs text-on-surface-variant shrink-0">← you</span>}
                  {roundChip(results[player.id], earned)}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {earned !== 0 && (
                    <span className={`text-xs font-bold tabular-nums ${earned > 0 ? 'text-primary' : 'text-error'}`}>
                      {earned > 0 ? '+' : ''}{earned}
                    </span>
                  )}
                  <span className="font-headline text-lg font-bold tabular-nums text-on-surface w-8 text-right">{player.score}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="text-center pt-1">
        {isHost ? (
          <button
            onClick={handleAdvance}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 transition-all"
          >
            {isLastRound ? 'SEE FINAL STANDINGS' : 'NEXT ROUND'}
          </button>
        ) : (
          <p className="text-sm text-on-surface-variant font-body animate-pulse">Waiting for host to continue...</p>
        )}
      </div>
    </div>
  )
}
