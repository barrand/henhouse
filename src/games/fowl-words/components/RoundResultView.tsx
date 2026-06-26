import { useState, useEffect, useRef } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound, submitGuesserMostHelpfulVote, submitGuesserBooVote } from '../service'
import { animateThumbBtn, playThumbVoteFx } from './thumbVoteFx'
import { stampMostHelpful } from './reactionFx'
import {
  PeerLoveChip,
  PeerBooChip,
  MostHelpfulCell,
  BooCell,
  StarIcon,
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
  const mostHelpfulBadgeRefs = useRef<Record<number, HTMLDivElement | null>>({})

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

  const myPoints = currentPlayerId ? round.pointsThisRound[currentPlayerId] ?? 0 : 0
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const guesserName = guesserPlayer?.name ?? 'The guesser'

  const fastBonusMap: Record<string, number> = {}
  if (round.isCorrect) {
    const attemptPts = [10, 5, 2, 1][round.currentAttempt - 1] ?? 0
    for (let gIdx = 0; gIdx < round.clueGroups.length; gIdx++) {
      const g = round.clueGroups[gIdx]
      if (!round.visibleGroupIndexes.includes(gIdx)) continue
      const loveCount = countGroupPeerLoves(peerLoveVotes, gIdx)
      const mvpPts = serverMostHelpful === gIdx ? mostHelpfulSplitPts(g.playerIds.length) : 0
      const basePts = attemptPts + (g.isDuplicate ? -1 : 0) + loveCount + mvpPts
      for (const pid of g.playerIds) {
        const bonus = (round.pointsThisRound[pid] ?? 0) - basePts
        if (bonus > 0) fastBonusMap[pid] = bonus
      }
    }
  }

  const handleMostHelpfulVote = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    animateThumbBtn(e.currentTarget, 'up')
    if (!round.isCorrect) return
    const current = pendingStarIdx !== null ? pendingStarIdx : serverMostHelpful
    const next = current === idx ? null : idx
    setPendingStarIdx(next)
    if (next !== null) {
      const badge = mostHelpfulBadgeRefs.current[idx]
      if (badge) stampMostHelpful(badge)
    }
    if (onMostHelpfulVote) {
      onMostHelpfulVote(idx)
    } else {
      submitGuesserMostHelpfulVote(game.id, game.currentRound, idx).catch(() => {})
    }
  }

  const handleGuesserBoo = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    playThumbVoteFx(e.currentTarget, 'down')
    const current = pendingBooIdx !== null ? pendingBooIdx : serverGuesserBoo
    setPendingBooIdx(current === idx ? null : idx)
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
                src={round.currentAttempt === 1 ? '/images/hen-excited.svg' : '/images/hen-winner.svg'}
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
              <img src="/images/hen-embarrassed.svg" alt="" className="w-28 h-28 mx-auto animate-hen-pop" />
              <h2 className="font-headline text-4xl font-bold text-error tracking-tight">NO CLUES</h2>
              <p className="text-on-surface-variant font-body text-sm">Nobody submitted a clue in time.</p>
            </>
          ) : (
            <>
              <img src="/images/hen-confused.svg" alt="" className="w-28 h-28 mx-auto animate-hen-pop" />
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

            <div className="grid grid-cols-2 gap-2">
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

                return (
                  <div
                    key={idx}
                    className={`relative bg-surface-container-lowest rounded-xl border-2 shadow-sm px-2.5 py-1.5 transition-all ${
                      group.isDuplicate && !isVisible
                        ? 'bg-surface-container-low border-outline-variant/50'
                        : isMostHelpful
                        ? 'border-primary/70 bg-primary/5'
                        : isGuesserBoo
                        ? 'border-error/60 bg-error/5'
                        : isVisible && round.isCorrect
                        ? 'border-primary/40'
                        : 'border-outline-variant/60'
                    }`}
                  >
                    <p
                      className={`font-headline font-bold text-xl leading-tight text-center line-clamp-2 h-11 flex items-center justify-center mb-0.5 ${
                        group.isDuplicate && !isVisible
                          ? 'text-error line-through'
                          : 'text-on-surface'
                      }`}
                    >
                      {displayText}
                    </p>

                    <div className="flex items-center justify-center gap-1 mb-1 min-w-0 w-full px-0.5 flex-wrap">
                      <span className="text-xs text-on-surface-variant font-medium font-body truncate min-w-0 leading-snug">
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
                    </div>

                    {((isVisible && round.isCorrect && isYours) || gotFastBonus) && (
                      <div className="mb-1 flex items-center justify-center gap-1 overflow-hidden flex-wrap">
                        {isVisible && round.isCorrect && isYours && (
                          <span className="bg-primary-fixed text-on-primary-fixed text-[10px] font-bold px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                            +{attemptPts} used
                          </span>
                        )}
                        {gotFastBonus && (
                          <span className="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                            ⚡ +{fastBonusMap[yourId]} fastest
                          </span>
                        )}
                      </div>
                    )}

                    {isMostHelpful && (
                      <div
                        ref={(el) => { mostHelpfulBadgeRefs.current[idx] = el }}
                        className="mb-1 flex items-center justify-center gap-1"
                      >
                        <span className="bg-primary-fixed text-on-primary-fixed text-[10px] font-bold px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                          ⭐ Most Helpful +{mvpPts}{group.playerIds.length > 1 ? ' each' : ''}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      {round.isCorrect ? (
                        <>
                          {canAwardMostHelpful ? (
                            <button
                              onClick={(e) => handleMostHelpfulVote(idx, e)}
                              aria-label={`Award Most Helpful to: ${displayText}`}
                              title={`Most Helpful +${mvpPts}${group.playerIds.length > 1 ? ' each' : ''}`}
                              className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label transition-all active:scale-[0.97] ${
                                isMostHelpful
                                  ? 'bg-primary-fixed shadow-sm'
                                  : 'bg-surface-container-low'
                              }`}
                            >
                              <StarIcon
                                filled={isMostHelpful}
                                className={isMostHelpful ? 'text-on-primary-fixed' : 'text-primary opacity-50'}
                              />
                              {isMostHelpful && (
                                <span className="text-[9px] font-bold leading-none text-on-primary-fixed">
                                  +{mvpPts}
                                </span>
                              )}
                            </button>
                          ) : (
                            <MostHelpfulCell
                              active={isMostHelpful}
                              perAuthor={mvpPts}
                              authorCount={group.playerIds.length}
                            />
                          )}
                          <BooCell
                            giverBooCount={canGuesserVote ? 0 : booCount}
                            guesserBoo={isGuesserBoo}
                            interactive={canGuesserVote}
                            isActive={isGuesserBoo}
                            onClick={canGuesserVote ? (e) => handleGuesserBoo(idx, e) : undefined}
                          />
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
                      ) : (
                        <BooCell
                          giverBooCount={booCount}
                          guesserBoo={isGuesserBoo}
                          wide
                        />
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

        {myPoints > 0 && (
          <div className="bg-primary text-on-primary rounded-2xl px-4 py-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] opacity-80 mb-0.5 font-bold">You earned</p>
            <p className="font-headline text-4xl font-bold tabular-nums">
              +{myPoints} <span className="text-2xl opacity-80">pts</span>
            </p>
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
              return (
                <li
                  key={p.id}
                  className={`px-3 py-2 flex items-center justify-between font-body ${isYou ? 'bg-secondary-fixed/20' : ''}`}
                >
                  <span className="flex items-center gap-2 font-medium text-on-surface">
                    <span className="text-outline w-5 tabular-nums">{i + 1}.</span>
                    {p.name}
                    {isYou && <span className="text-xs text-on-surface-variant">← you</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    {earned > 0 && (
                      <span className="text-xs text-primary font-bold tabular-nums">+{earned}</span>
                    )}
                    <span className="font-headline text-lg font-bold tabular-nums text-on-surface">{p.score}</span>
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
