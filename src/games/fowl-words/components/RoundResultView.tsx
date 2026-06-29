import { useState, useEffect, useRef, useMemo } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound, submitGuesserMostHelpfulVote, submitGuesserBooVote } from '../service'
import { animateThumbBtn } from './thumbVoteFx'
import { playMostHelpfulAwardFx, playBooAwardFx, stampMostHelpful } from './reactionFx'
import { computeRoundPointBreakdown } from './pointBreakdown'
import { PointBreakdownChips } from './PointBreakdownChips'
import {
  PeerLoveChip,
  PeerBooChip,
  MostHelpfulCell,
  BooCell,
  ScoreChip,
  CARD_VOTE_TRANSITION,
  clueCardBorderClass,
  guesserResultVoteHint,
  mostHelpfulSplitPts,
  countGroupPeerLoves,
  countGroupPeerBoos,
  effectivePeerLoveVotes,
  effectivePeerBooVotes,
  effectiveMostHelpfulVote,
  effectiveGuesserBoo,
} from './clueVoteUi'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
  onMostHelpfulVote?: (groupIdx: number) => void
  onGuesserBoo?: (groupIdx: number) => void
}

export default function RoundResultView({
  game, round, players, isHost, currentPlayerId,
  onMostHelpfulVote, onGuesserBoo,
}: Props) {
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const [pendingStarIdx, setPendingStarIdx] = useState<number | null>(null)
  const [pendingBooIdx, setPendingBooIdx] = useState<number | null>(null)
  const mostHelpfulBadgeRefs = useRef<Record<number, HTMLElement | null>>({})
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const pendingStarBadgeAnimRef = useRef<number | null>(null)

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const isLastRound = game.currentRound >= game.settings.totalRounds
  const isCurrentGuesser = currentPlayerId === game.currentGuesser

  const handleAdvance = async () => {
    setError('')
    setAdvancing(true)
    try { await advanceRound(game.id) } catch (err: any) {
      setError(err.message ?? "Couldn't move on")
      setAdvancing(false)
    }
  }

  const peerLoveVotes = effectivePeerLoveVotes(round.cluePeerLoveVotes, round.clueStarVotes)
  const peerBooVotes = effectivePeerBooVotes(round.cluePeerBooVotes, round.clueThumbsDownVotes)
  const serverMostHelpful = effectiveMostHelpfulVote(round.guesserMostHelpfulVote, round.guesserStarVote)
  const serverGuesserBoo = effectiveGuesserBoo(round.guesserBooVote, round.guesserThumbsDownVote)

  const activeMostHelpfulIdx =
    pendingStarIdx !== null ? pendingStarIdx : serverMostHelpful
  const activeGuesserBooIdx =
    pendingBooIdx !== null ? pendingBooIdx : serverGuesserBoo

  useEffect(() => {
    if (pendingStarIdx !== null && serverMostHelpful === pendingStarIdx) setPendingStarIdx(null)
  }, [serverMostHelpful, pendingStarIdx])

  useEffect(() => {
    if (pendingBooIdx !== null && serverGuesserBoo === pendingBooIdx) setPendingBooIdx(null)
  }, [serverGuesserBoo, pendingBooIdx])

  useEffect(() => {
    const idx = pendingStarBadgeAnimRef.current
    if (idx === null) return
    const badge = mostHelpfulBadgeRefs.current[idx]
    if (badge && activeMostHelpfulIdx === idx) {
      stampMostHelpful(badge)
      pendingStarBadgeAnimRef.current = null
    }
  }, [activeMostHelpfulIdx, pendingStarIdx, serverMostHelpful])

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const guesserName = guesserPlayer?.name ?? 'The guesser'

  const pointBreakdowns = useMemo(
    () => computeRoundPointBreakdown(round, game.currentGuesser ?? ''),
    [round, game.currentGuesser],
  )

  const fastBonusMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [pid, chips] of Object.entries(pointBreakdowns)) {
      const fast = chips.find((c) => c.kind === 'fast')
      if (fast) map[pid] = fast.pts
    }
    return map
  }, [pointBreakdowns])

  const handleMostHelpfulVote = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!round.isCorrect) return
    const current = pendingStarIdx !== null ? pendingStarIdx : serverMostHelpful
    const isAdding = current !== idx
    if (isAdding) {
      playMostHelpfulAwardFx(e.currentTarget, cardRefs.current[idx])
      pendingStarBadgeAnimRef.current = idx
    } else {
      animateThumbBtn(e.currentTarget, 'up')
    }
    const next = isAdding ? idx : null
    setPendingStarIdx(next)
    if (onMostHelpfulVote) {
      onMostHelpfulVote(idx)
    } else {
      submitGuesserMostHelpfulVote(game.id, game.currentRound, idx).catch(() => {})
    }
  }

  const handleGuesserBoo = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const current = pendingBooIdx !== null ? pendingBooIdx : serverGuesserBoo
    const isAdding = current !== idx
    if (isAdding) {
      playBooAwardFx(e.currentTarget, cardRefs.current[idx])
    } else {
      animateThumbBtn(e.currentTarget, 'down')
    }
    setPendingBooIdx(isAdding ? idx : null)
    if (onGuesserBoo) {
      onGuesserBoo(idx)
    } else {
      submitGuesserBooVote(game.id, game.currentRound, idx).catch(() => {})
    }
  }

  const hasVisibleClues = round.clueGroups.some((_, i) => round.visibleGroupIndexes.includes(i))
  const visibleSet = new Set(round.visibleGroupIndexes)
  const clueGroupDisplayOrder = [
    ...round.clueGroups.map((_, i) => i).filter((i) => visibleSet.has(i)),
    ...round.clueGroups.map((_, i) => i).filter((i) => !visibleSet.has(i)),
  ]
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'

  const renderAuthorNames = (playerIds: string[], isYours: boolean) => {
    if (playerIds.length === 1) {
      return isYours && playerIds[0] === currentPlayerId
        ? <span className="text-primary font-bold">← you</span>
        : playerName(playerIds[0])
    }
    return playerIds.map((id, i) => (
      <span key={id}>
        {i > 0 && ', '}
        {id === currentPlayerId
          ? <span className="text-primary font-bold">← you</span>
          : playerName(id)}
      </span>
    ))
  }

  return (
    <main className="flex-1 flex flex-col px-4 py-4">
      <div className="max-w-md w-full mx-auto space-y-4">
        <div className="text-center space-y-2">
          {round.isCorrect ? (
            <>
              <img
                src={round.currentAttempt === 1 ? '/images/generated-comic/hen-excited.png' : '/images/generated-comic/hen-winner.png'}
                alt=""
                className={`w-28 h-28 mx-auto ${round.currentAttempt === 1 ? 'animate-hen-celebrate' : 'animate-hen-pop'}`}
              />
              <h2 className="font-headline text-4xl font-bold text-primary tracking-tight">NAILED IT!</h2>
              <p className="text-on-surface-variant font-body text-sm">
                {guesserName} got{' '}
                <span className="font-headline font-bold text-2xl text-primary tracking-tight">{round.secretWord}</span>
                {round.currentAttempt > 1 && (
                  <span className="block text-xs mt-1 opacity-75">
                    on attempt {round.currentAttempt} of {round.maxAttempts}
                  </span>
                )}
              </p>
            </>
          ) : round.clueGroups.length === 0 ? (
            <>
              <img src="/images/generated-comic/hen-embarrassed.png" alt="" className="w-28 h-28 mx-auto animate-hen-pop" />
              <h2 className="font-headline text-4xl font-bold text-error tracking-tight">NO CLUES</h2>
              <p className="text-on-surface-variant font-body text-sm">Nobody submitted a clue in time.</p>
            </>
          ) : (
            <>
              <img src="/images/generated-comic/hen-confused.png" alt="" className="w-28 h-28 mx-auto animate-hen-pop" />
              <h2 className="font-headline text-4xl font-bold text-error tracking-tight">NO LUCK</h2>
              <p className="text-on-surface-variant font-body text-sm">
                {guesserName} ran out of guesses.
              </p>
              {(round.guessAttempts.length > 0 || round.guesserAnswer) && (
                <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
                  {(round.guessAttempts.length > 0
                    ? round.guessAttempts
                    : [round.guesserAnswer!]
                  ).map((g, i) => (
                    <span key={i} className="text-sm text-on-surface-variant font-body">
                      <span className="font-label text-[10px] text-outline tabular-nums">{i + 1}.</span>{' '}
                      <span className="font-bold text-on-surface">{g}</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!round.isCorrect && (
          <div className="bg-primary-fixed border-2 border-primary-fixed-dim rounded-2xl px-4 py-3 text-center shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-primary-fixed-variant font-bold mb-0.5">
              The word was
            </p>
            <p className="font-headline text-3xl font-bold text-on-primary-fixed tracking-tight">
              {round.secretWord}
            </p>
          </div>
        )}

        {round.clueGroups.length > 0 && (
          <div>
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
              What everyone wrote
            </h3>

            {isCurrentGuesser && hasVisibleClues && (
              <div className="mb-3 bg-tertiary-container/40 border border-tertiary/30 rounded-xl px-4 py-3 text-center">
                <p className="text-xs font-bold text-on-tertiary-container uppercase tracking-wider font-label">
                  Rate the clues
                </p>
                <p className="text-[11px] text-on-surface-variant mt-0.5 font-body">
                  {guesserResultVoteHint(!!round.isCorrect)}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 items-stretch">
              {clueGroupDisplayOrder.map((idx) => {
                const group = round.clueGroups[idx]
                const isVisible = visibleSet.has(idx)
                const isYours = group.playerIds.includes(currentPlayerId ?? '')
                const displayText = group.clueTexts[0]?.trim() || '—'

                const yourId = currentPlayerId ?? ''
                const gotFastBonus = isYours && !!fastBonusMap[yourId] && group.playerIds.includes(yourId)
                const attemptPts = [10, 5, 2, 1][round.currentAttempt - 1] ?? 0

                const loveCount = countGroupPeerLoves(peerLoveVotes, idx)
                const booCount = countGroupPeerBoos(peerBooVotes, idx)
                const mvpPts = mostHelpfulSplitPts(group.playerIds.length)

                const isMostHelpful = activeMostHelpfulIdx === idx
                const isGuesserBoo = activeGuesserBooIdx === idx
                const canGuesserVote = isCurrentGuesser && isVisible && !isYours
                const canAwardMostHelpful = canGuesserVote && round.isCorrect
                const showPassiveMostHelpful = !canAwardMostHelpful && isMostHelpful
                const showPassiveGuesserBoo = !canGuesserVote && isGuesserBoo

                const showUsedBadge = isVisible && round.isCorrect && isYours

                return (
                  <div
                    key={idx}
                    ref={(el) => { cardRefs.current[idx] = el }}
                    className={`relative flex flex-col h-full bg-surface-container-lowest rounded-xl border-2 shadow-sm px-2.5 py-1.5 ${CARD_VOTE_TRANSITION} ${clueCardBorderClass({
                      hiddenDuplicate: group.isDuplicate && !isVisible,
                      isMostHelpful,
                      isGuesserBoo,
                      visibleCorrect: isVisible && round.isCorrect,
                    })}`}
                  >
                    <p
                      className={`font-headline font-bold text-xl leading-tight text-center line-clamp-2 h-11 flex items-center justify-center mb-0.5 shrink-0 ${
                        group.isDuplicate && !isVisible
                          ? 'text-error line-through'
                          : 'text-on-surface'
                      }`}
                    >
                      {displayText}
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-1 mb-1 min-w-0 w-full px-0.5 shrink-0">
                      <span className="text-xs text-on-surface-variant font-medium font-body truncate min-w-0 leading-snug max-w-full">
                        {renderAuthorNames(group.playerIds, isYours)}
                        {group.isDuplicate && isYours && (
                          <span className="text-error font-bold"> · -1</span>
                        )}
                        {group.isDuplicate && !isYours && (
                          <span className="text-error font-bold uppercase text-[9px] tracking-wide"> · dup</span>
                        )}
                      </span>
                      <PeerLoveChip count={loveCount} />
                      <PeerBooChip count={booCount} />
                      {showUsedBadge && <ScoreChip>+{attemptPts}</ScoreChip>}
                      {gotFastBonus && <ScoreChip icon="⚡">+{fastBonusMap[yourId]}</ScoreChip>}
                      {isMostHelpful && (
                        <span ref={(el) => { mostHelpfulBadgeRefs.current[idx] = el }}>
                          <ScoreChip icon="⭐">
                            +{mvpPts}{group.playerIds.length > 1 ? ' each' : ''}
                          </ScoreChip>
                        </span>
                      )}
                    </div>

                    <div className="flex gap-1.5 mt-auto shrink-0 min-h-9">
                      {round.isCorrect ? (
                        <>
                          {canAwardMostHelpful ? (
                            <MostHelpfulCell
                              active={isMostHelpful}
                              perAuthor={mvpPts}
                              authorCount={group.playerIds.length}
                              interactive
                              ariaLabel={`Award Most Helpful to: ${displayText}`}
                              title={`Most Helpful +${mvpPts}${group.playerIds.length > 1 ? ' each' : ''}`}
                              onClick={(e) => handleMostHelpfulVote(idx, e)}
                            />
                          ) : showPassiveMostHelpful ? (
                            <MostHelpfulCell
                              active={isMostHelpful}
                              perAuthor={mvpPts}
                              authorCount={group.playerIds.length}
                            />
                          ) : (
                            <div className="flex-1" aria-hidden="true" />
                          )}
                          {canGuesserVote || showPassiveGuesserBoo ? (
                            <BooCell
                              giverBooCount={canGuesserVote ? 0 : booCount}
                              guesserBoo={isGuesserBoo}
                              interactive={canGuesserVote}
                              isActive={isGuesserBoo}
                              onClick={canGuesserVote ? (e) => handleGuesserBoo(idx, e) : undefined}
                            />
                          ) : (
                            <div className="flex-1" aria-hidden="true" />
                          )}
                        </>
                      ) : canGuesserVote ? (
                        <BooCell
                          giverBooCount={0}
                          guesserBoo={isGuesserBoo}
                          interactive
                          wide
                          isActive={isGuesserBoo}
                          onClick={(e) => handleGuesserBoo(idx, e)}
                        />
                      ) : showPassiveGuesserBoo ? (
                        <BooCell
                          giverBooCount={booCount}
                          guesserBoo={isGuesserBoo}
                          wide
                        />
                      ) : (
                        <div className="flex-1" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isCurrentGuesser && (
          <div className={`rounded-xl px-4 py-3 text-center font-body border ${round.isCorrect ? 'bg-primary-fixed/20 border-primary-fixed-dim' : 'bg-surface-container-low border-outline-variant/20'}`}>
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-label mb-1">Your result as guesser</p>
            <p className="font-headline font-bold text-lg text-on-surface">
              {round.isCorrect
                ? ([
                    '🎯 Got it on the first try!',
                    "✨ Second time's the charm!",
                    '💪 Persistence pays off!',
                    '🔓 Finally unlocked it!',
                  ][round.currentAttempt - 1] ?? '✅ Correct!')
                : round.clueGroups.length === 0
                ? '🤷 Nothing to work with!'
                : '😅 Better luck next time!'}
            </p>
            {round.isCorrect && (
              <p className="text-primary font-bold text-sm mt-1">+{[10, 5, 2, 1][round.currentAttempt - 1] ?? 0} points</p>
            )}
          </div>
        )}

        <div>
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
            Standings
          </h3>
          <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 divide-y divide-outline-variant/20 overflow-hidden">
            {sortedPlayers.map((p, i) => {
              const earned = round.pointsThisRound[p.id] ?? 0
              const isYou = p.id === currentPlayerId
              const chips = pointBreakdowns[p.id] ?? []
              return (
                <li
                  key={p.id}
                  className={`px-3 py-2 font-body flex items-center gap-2 ${isYou ? 'bg-secondary-fixed/20' : ''}`}
                >
                  <span className="text-outline w-5 tabular-nums shrink-0 text-sm">{i + 1}.</span>
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="font-medium text-on-surface truncate">{p.name}</span>
                    {isYou && <span className="text-xs text-on-surface-variant shrink-0">← you</span>}
                    {chips.length > 0 && (
                      <PointBreakdownChips chips={chips} className="gap-0.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {earned !== 0 && (
                      <span className={`text-xs font-bold tabular-nums ${earned > 0 ? 'text-primary' : 'text-error'}`}>
                        {earned > 0 ? '+' : ''}{earned}
                      </span>
                    )}
                    <span className="font-headline text-lg font-bold tabular-nums text-on-surface w-8 text-right">{p.score}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {isHost ? (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {advancing ? 'Loading…' : isLastRound ? 'See final scores →' : 'Next round →'}
          </button>
        ) : (
          <p className="text-center text-outline text-sm animate-pulse font-body">
            Waiting on the host to deal the next round…
          </p>
        )}

        {error && <p className="text-center text-error text-sm font-body">{error}</p>}
      </div>
    </main>
  )
}
