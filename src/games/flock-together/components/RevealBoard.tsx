import type { GameData, RoundData, PlayerData } from '../types'
import { buildClusters } from '../answerClusters'
import BottomActionDock from '../../../shared/BottomActionDock'
import { advanceRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

function ordinal(rank: number) {
  const lastTwo = rank % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th'
  return `${rank}${suffix}`
}

function pointLabel(points: number) {
  return `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points)} ${Math.abs(points) === 1 ? 'point' : 'points'}`
}

export default function RevealBoard({ game, round, players, isHost, currentPlayerId }: Props) {
  const playerNameById = (id: string) => players.find((p) => p.id === id)?.name ?? id

  if (round.status === 'revealing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center space-y-3">
          <img src="/images/generated-comic/midnight/hen-pecking.png" alt="" className="w-20 h-20 mx-auto animate-hen-peck" />
          <p className="font-headline text-xl font-bold text-on-surface">Checking all answers...</p>
          <p className="text-on-surface-variant text-sm font-body">The flock is being counted</p>
        </div>
      </div>
    )
  }

  const results = round.results ?? {}
  const hasFlock = Object.values(results).includes('flock')
  const isLastRound = game.currentRound >= game.settings.totalRounds
  const currentPlayer = players.find((player) => player.id === currentPlayerId)
  const yourResult = currentPlayerId ? results[currentPlayerId] : undefined
  const yourPoints = currentPlayerId ? (round.pointsThisRound?.[currentPlayerId] ?? 0) : 0
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const { clusters, noAnswerIds } = buildClusters(round, currentPlayerId)
  const yourCluster = clusters.find((cluster) => currentPlayerId && cluster.playerIds.includes(currentPlayerId))
  const answeredCount = clusters.reduce((sum, cluster) => sum + cluster.playerIds.length, 0)
  const participantCount = answeredCount + noAnswerIds.length
  const rankOf = (score: number) => 1 + players.filter((player) => player.score > score).length
  const yourRank = currentPlayer ? rankOf(currentPlayer.score) : null
  const isTied = currentPlayer ? players.filter((player) => player.score === currentPlayer.score).length > 1 : false
  const isWin = yourResult === 'flock' && yourPoints > 0

  const hero = (() => {
    if (!yourResult) return null
    if (yourResult === 'no-answer') return {
      title: 'Missed this round',
      context: 'Your answer didn’t arrive in time. Your score stays the same.',
      image: 'hen-sleeping.png',
    }
    if (yourResult === 'rotten') return {
      title: 'A flock of one',
      context: 'You were the lone odd one out this round.',
      image: 'hen-embarrassed.png',
    }
    if (!hasFlock) return {
      title: 'No flock this time',
      context: 'No answer formed a flock. Your score stays the same.',
      image: 'hen-confused.png',
    }
    if (yourResult === 'flock') {
      const others = (yourCluster?.playerIds.length ?? 1) - 1
      return {
        title: 'You found the flock!',
        context: `You and ${others} ${others === 1 ? 'other player' : 'others'} chose the most popular answer.`,
        image: 'hen-excited.png',
      }
    }
    return {
      title: 'Outside the flock',
      context: 'The largest group chose differently. Your score stays the same.',
      image: 'hen-embarrassed.png',
    }
  })()

  const handleAdvance = async () => {
    try {
      await advanceRound(game.id)
    } catch (err) {
      console.error('Failed to advance:', err)
    }
  }

  const renderNames = (ids: string[]) => (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {ids.map((id) => (
        <span key={id} className={`px-2 py-1 rounded-lg text-xs font-body break-words ${id === currentPlayerId ? 'bg-success text-on-success font-bold' : 'bg-surface-container-high text-on-surface'}`}>
          {playerNameById(id)}{id === currentPlayerId && ' ← you'}
        </span>
      ))}
    </div>
  )

  return (
    <div data-action-screen className="flex-1 px-4 pt-6 pb-6 space-y-5 font-body">
      <p className="text-sm text-on-surface-variant leading-relaxed break-words">{round.question}</p>

      {hero && (
        <section aria-label="Your round result" className={`rounded-2xl border-2 p-5 ${isWin ? 'bg-success-fixed border-success text-on-success-fixed' : 'bg-surface-container-low border-outline-variant/60 text-on-surface'}`}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className={`font-label text-[11px] uppercase tracking-widest font-bold ${isWin ? 'text-on-success-fixed-variant' : 'text-on-surface-variant'}`}>Your round</p>
              <h2 className="font-headline text-2xl font-bold mt-2 leading-tight">{hero.title}</h2>
            </div>
            <img src={`/images/generated-comic/midnight/${hero.image}`} alt="" className={`w-16 h-16 shrink-0 ${isWin ? 'animate-hen-celebrate' : ''}`} />
          </div>
          <p className={`text-sm leading-relaxed mt-3 ${isWin ? 'text-on-success-fixed-variant' : 'text-on-surface-variant'}`}>{hero.context}</p>
          <div className={`flex flex-wrap justify-between items-baseline gap-2 mt-4 pt-3 border-t ${isWin ? 'border-on-success-fixed-variant/50' : 'border-outline-variant/50'}`}>
            <p className="text-lg font-bold tabular-nums">{pointLabel(yourPoints)}</p>
            {currentPlayer && <p className="text-sm tabular-nums">{currentPlayer.score} {currentPlayer.score === 1 ? 'point' : 'points'} total</p>}
          </div>
        </section>
      )}

      <section aria-label="Round answers" className="space-y-3">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h3 className="font-headline text-lg font-semibold text-on-surface">How everyone answered</h3>
          <p className="text-xs text-on-surface-variant">{noAnswerIds.length ? `${answeredCount} answered · ${noAnswerIds.length} missed` : `${participantCount} players`}</p>
        </div>

        {clusters.map((cluster) => {
          const isYours = cluster.playerIds.includes(currentPlayerId ?? '')
          const otherVariations = cluster.variations.filter((answer) => answer !== cluster.answer)
          return (
            <article key={`${cluster.type}:${cluster.answer}`} className={`rounded-2xl bg-surface-container-low border-2 p-4 ${isYours ? 'border-success' : 'border-outline-variant/60'}`}>
              {(isYours || cluster.type === 'flock' || cluster.type === 'rotten') && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-label text-[11px] uppercase tracking-wide font-bold mb-2">
                  {isYours && <span className="text-success">Your answer</span>}
                  {cluster.type === 'flock' && <span className="text-on-surface-variant">The flock · +1 each</span>}
                  {cluster.type === 'rotten' && <span className="text-on-surface-variant">Lone answer · −1</span>}
                </div>
              )}
              <div className="flex justify-between items-baseline gap-3">
                <p className="font-mono text-base font-bold text-on-surface break-words min-w-0">{cluster.answer}</p>
                <p className="text-sm text-on-surface-variant shrink-0 tabular-nums" aria-label={`${cluster.playerIds.length} ${cluster.playerIds.length === 1 ? 'player' : 'players'}`}>{cluster.playerIds.length}</p>
              </div>
              <div className="h-1 mt-3 bg-on-surface/10 rounded-full overflow-hidden" aria-hidden="true">
                <div className={`h-full rounded-full ${isYours ? 'bg-success' : 'bg-on-surface-variant'}`} style={{ width: `${participantCount ? cluster.playerIds.length / participantCount * 100 : 0}%` }} />
              </div>
              {renderNames(cluster.playerIds)}
              {round.type !== 'multiple_choice' && otherVariations.length > 0 && (
                <details className="mt-2">
                  <summary className="text-sm text-on-surface-variant cursor-pointer min-h-11 content-center w-fit">Answer variations</summary>
                  <ul className="text-sm text-on-surface-variant font-mono space-y-1 pt-2">
                    {otherVariations.map((answer) => <li key={answer} className="break-words">{answer}</li>)}
                  </ul>
                </details>
              )}
            </article>
          )
        })}

        {noAnswerIds.length > 0 && (
          <article className={`rounded-2xl border-2 bg-surface-container-low p-4 ${yourResult === 'no-answer' ? 'border-success' : 'border-outline-variant/60'}`}>
            <div className="flex justify-between gap-3 text-sm">
              <p className={yourResult === 'no-answer' ? 'text-success font-bold' : 'text-on-surface-variant'}>{yourResult === 'no-answer' ? 'You didn’t answer' : 'No answer'}</p>
              <span className="text-on-surface-variant tabular-nums">{noAnswerIds.length}</span>
            </div>
            <details className="mt-2">
              <summary className="text-sm text-on-surface-variant cursor-pointer min-h-11 content-center w-fit">Who missed this round?</summary>
              {renderNames(noAnswerIds)}
            </details>
          </article>
        )}
      </section>

      <section aria-label="Standings" className="border-t border-outline-variant/50 pt-4">
        {currentPlayer && yourRank !== null && (
          <div className="mb-3">
            <p className="text-xs text-on-surface-variant">Your standing</p>
            <p className="font-semibold text-on-surface">{isTied ? 'Tied ' : ''}{ordinal(yourRank)} · {currentPlayer.score} {currentPlayer.score === 1 ? 'point' : 'points'}</p>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-on-surface min-h-11 content-center w-fit">View standings</summary>
          <ul className="mt-3 bg-surface-container-low rounded-2xl border border-outline-variant/60 divide-y divide-outline-variant/50 overflow-hidden">
            {sortedPlayers.map((player) => {
              const earned = round.pointsThisRound?.[player.id] ?? 0
              const isYou = player.id === currentPlayerId
              return (
                <li key={player.id} className={`px-3 py-3 flex items-center gap-2 ${isYou ? 'bg-success/10' : ''}`}>
                  <span className="text-on-surface-variant w-7 tabular-nums shrink-0 text-sm">{rankOf(player.score)}.</span>
                  <span className="font-medium text-on-surface flex-1 min-w-0 break-words">{player.name}{isYou && <span className="text-success"> ← you</span>}</span>
                  <span className={`text-xs font-bold tabular-nums shrink-0 ${earned > 0 ? 'text-success' : earned < 0 ? 'text-secondary' : 'text-on-surface-variant'}`}>{pointLabel(earned)}</span>
                  <span className="font-headline text-lg font-bold tabular-nums text-on-surface w-8 text-right shrink-0">{player.score}</span>
                </li>
              )
            })}
          </ul>
        </details>
      </section>

      <BottomActionDock>
        <div className="max-w-md mx-auto text-center">
          {isHost ? (
            <button onClick={handleAdvance} className="w-full bg-action text-on-action h-14 rounded-xl font-body font-semibold tracking-wide shadow-sticker hover:opacity-90 active:scale-95 transition-all">
              {isLastRound ? 'SEE FINAL STANDINGS' : 'NEXT ROUND'}
            </button>
          ) : (
            <p className="text-sm text-on-surface-variant font-body">Waiting for the host to {isLastRound ? 'show final standings' : 'start the next round'}</p>
          )}
        </div>
      </BottomActionDock>
    </div>
  )
}
