import type { GameData, RoundData, PlayerData, RoundResult } from '../types'
import { advanceRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

type ResultGroupId = 'flock' | 'outlier' | 'rotten' | 'no-answer'

const RESULT_GROUPS: {
  id: ResultGroupId
  label: string
  icon: string | null
  subtitle: (count: number, hasFlock: boolean) => string
  cardClass: string
  titleClass: string
  iconWrapClass: string
}[] = [
  {
    id: 'flock',
    label: 'The Flock',
    icon: '/images/hen-excited.svg',
    subtitle: (n, hasFlock) => (hasFlock ? `${n} matched · +1 egg each` : `${n} player${n === 1 ? '' : 's'}`),
    cardClass: 'border-2 border-primary bg-surface-container-lowest',
    titleClass: 'text-primary',
    iconWrapClass: 'bg-primary-fixed',
  },
  {
    id: 'outlier',
    label: 'Flown the Coop',
    icon: '/images/hen-flying.svg',
    subtitle: (n) => `${n} missed the majority`,
    cardClass: 'border-2 border-secondary bg-surface-container-lowest',
    titleClass: 'text-secondary',
    iconWrapClass: 'bg-secondary-fixed',
  },
  {
    id: 'rotten',
    label: 'Rotten Egg',
    icon: '/images/rotten-egg.svg',
    subtitle: (n) => (n === 1 ? 'odd chicken out' : `${n} odd chickens out`),
    cardClass: 'border-2 border-tertiary-fixed-dim bg-surface-container-lowest',
    titleClass: 'text-tertiary',
    iconWrapClass: 'bg-tertiary-fixed',
  },
  {
    id: 'no-answer',
    label: 'No Answer',
    icon: null,
    subtitle: (n) => `${n} too slow`,
    cardClass: 'border-2 border-outline-variant bg-surface-container-lowest',
    titleClass: 'text-on-surface-variant',
    iconWrapClass: 'bg-surface-container-high',
  },
]

function groupPlayersByResult(results: Record<string, RoundResult>): Record<ResultGroupId, string[]> {
  const grouped: Record<ResultGroupId, string[]> = {
    flock: [],
    outlier: [],
    rotten: [],
    'no-answer': [],
  }
  for (const [playerId, result] of Object.entries(results)) {
    if (result in grouped) grouped[result as ResultGroupId].push(playerId)
  }
  return grouped
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

export default function RevealBoard({ game, round, players, isHost, currentPlayerId }: Props) {
  const playerNameById = (id: string) => players.find((p) => p.id === id)?.name ?? id

  if (round.status === 'revealing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center space-y-3">
          <img src="/images/hen-pecking.svg" alt="" className="w-20 h-20 animate-hen-peck mx-auto" />
          <p className="font-headline text-xl font-bold text-on-surface">Checking all answers...</p>
          <p className="text-outline text-sm font-body">The flock is being counted</p>
        </div>
      </div>
    )
  }

  const playerAnswers = round.playerAnswers ?? {}
  const results = round.results ?? {}
  const hasFlock = Object.values(results).some((r) => r === 'flock')
  const grouped = groupPlayersByResult(results)
  const isLastRound = game.currentRound >= game.settings.totalRounds
  const yourResult = currentPlayerId ? results[currentPlayerId] : undefined

  const handleAdvance = async () => {
    try {
      await advanceRound(game.id)
    } catch (err) {
      console.error('Failed to advance:', err)
    }
  }

  const sortByName = (ids: string[]) =>
    [...ids].sort((a, b) => playerNameById(a).localeCompare(playerNameById(b)))

  const yourResultLine = () => {
    if (!yourResult) return null
    switch (yourResult) {
      case 'flock':
        return hasFlock ? 'You matched the flock — +1 egg!' : null
      case 'outlier':
        return 'You flew the coop this round.'
      case 'rotten':
        return 'You had the Rotten Egg.'
      case 'no-answer':
        return "You didn't answer in time."
      default:
        return null
    }
  }

  const renderNameGrid = (playerIds: string[]) => (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {sortByName(playerIds).map((playerId) => {
        const isYou = playerId === currentPlayerId
        return (
          <li key={playerId} className="min-w-0 font-medium text-on-surface font-body truncate">
            {playerNameById(playerId)}
            {isYou && <span className="text-on-surface-variant text-xs font-normal ml-1">← you</span>}
          </li>
        )
      })}
    </ul>
  )

  const renderAnswerClusters = (playerIds: string[]) => (
    <div className="space-y-4">
      {groupByAnswer(playerIds, playerAnswers).map(({ answer, playerIds: clusterIds }) => (
        <div key={answer}>
          <p className="font-headline text-base font-bold text-on-surface">{answer}</p>
          <p className="mt-1 text-sm font-body text-on-surface leading-relaxed">
            {sortByName(clusterIds).map((playerId, i) => {
              const isYou = playerId === currentPlayerId
              return (
                <span key={playerId}>
                  {i > 0 && <span className="text-outline-variant"> · </span>}
                  <span className="font-medium">{playerNameById(playerId)}</span>
                  {isYou && <span className="text-on-surface-variant text-xs"> ← you</span>}
                </span>
              )
            })}
          </p>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex-1 px-4 py-6 space-y-5">
      {/* Question — same card language as QuestionDisplay */}
      <div className="rounded-2xl border-2 p-5 text-center shadow-sm bg-surface-container-lowest border-outline-variant/60">
        <p className="font-headline text-xl font-bold text-on-surface leading-relaxed">{round.question}</p>
      </div>

      {yourResultLine() && (
        <p className="text-center font-body text-sm font-semibold text-secondary">{yourResultLine()}</p>
      )}

      {/* Round breakdown — separate card per category */}
      <section className="space-y-3">
        <h3 className="font-headline text-lg font-semibold text-primary px-1">Round breakdown</h3>
        {RESULT_GROUPS.map(({ id, label, icon, subtitle, cardClass, titleClass, iconWrapClass }) => {
          const memberIds = grouped[id]
          if (memberIds.length === 0) return null

          return (
            <div key={id} className={`rounded-2xl p-4 shadow-sm ${cardClass}`}>
              <div className="flex items-center gap-3 mb-3">
                {icon ? (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconWrapClass}`}>
                    <img src={icon} alt="" className="w-8 h-8" />
                  </div>
                ) : (
                  <div className={`w-10 h-10 rounded-xl shrink-0 ${iconWrapClass}`} />
                )}
                <div className="min-w-0">
                  <p className={`font-headline text-base font-semibold ${titleClass}`}>{label}</p>
                  <p className="text-on-surface-variant text-xs font-body">{subtitle(memberIds.length, hasFlock)}</p>
                </div>
              </div>
              {id === 'no-answer'
                ? renderNameGrid(memberIds)
                : renderAnswerClusters(memberIds)}
            </div>
          )
        })}
      </section>

      <div className="text-center pt-1">
        {isHost ? (
          <button
            onClick={handleAdvance}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 transition-all"
          >
            {isLastRound ? 'SEE FINAL PECKING ORDER' : 'NEXT ROUND'}
          </button>
        ) : (
          <p className="text-sm text-on-surface-variant font-body animate-pulse">Waiting for host to continue...</p>
        )}
      </div>
    </div>
  )
}
