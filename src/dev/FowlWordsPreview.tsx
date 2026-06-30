import { useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Lobby from '@fowl-words/components/Lobby'
import GameHeader from '@fowl-words/components/GameHeader'
import WordSelectionView from '@fowl-words/components/WordSelectionView'
import ClueSubmissionView from '@fowl-words/components/ClueSubmissionView'
import DeduplicationView from '@fowl-words/components/DeduplicationView'
import RevealView from '@fowl-words/components/RevealView'
import GuessView from '@fowl-words/components/GuessView'
import RoundResultView from '@fowl-words/components/RoundResultView'
import Scoreboard from '@fowl-words/components/Scoreboard'
import LeaderboardModal from '@fowl-words/components/LeaderboardModal'
import type { RoundData } from '@fowl-words/types'
import { effectiveMostHelpfulVote, mostHelpfulSplitPts } from '@fowl-words/components/clueVoteUi'
import {
  FOWL_WORDS_PREVIEW_SCREENS,
  PREVIEW_GUESSER_ID,
  PREVIEW_PLAYERS,
  getFowlWordsPreviewScenario,
  type FowlWordsPreviewScreen,
} from './fowlWordsPreviewData'

const DEFAULT_SCREEN: FowlWordsPreviewScreen = 'lobby'

function isValidScreen(s: string | undefined): s is FowlWordsPreviewScreen {
  return FOWL_WORDS_PREVIEW_SCREENS.some((item) => item.id === s)
}

/** Mirror server: Most Helpful increments pointsThisRound when guesser picks a clue */
function withMostHelpfulPoints(round: RoundData): RoundData {
  if (round.status !== 'scored' || !round.isCorrect) return round
  const vote = effectiveMostHelpfulVote(round.guesserMostHelpfulVote, round.guesserStarVote)
  if (vote === null) return round
  const group = round.clueGroups[vote]
  if (!group || !round.visibleGroupIndexes.includes(vote)) return round
  const pts = mostHelpfulSplitPts(group.playerIds.length)
  const points = { ...round.pointsThisRound }
  for (const pid of group.playerIds) {
    points[pid] = (points[pid] ?? 0) + pts
  }
  return { ...round, pointsThisRound: points }
}

export default function FowlWordsPreview() {
  const { screen: screenParam } = useParams<{ screen?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = isValidScreen(screenParam) ? screenParam : DEFAULT_SCREEN
  const asPlayerId = searchParams.get('as') ?? 'p1'
  const scenario = getFowlWordsPreviewScenario(screen, asPlayerId)
  const currentPlayer = scenario.players.find((p) => p.id === scenario.currentPlayerId) ?? null
  const isGuesser = scenario.game.currentGuesser === scenario.currentPlayerId

  const [localLoves, setLocalLoves] = useState<Record<string, true>>({})
  const [localBoo, setLocalBoo] = useState<number | null>(null)
  const [localMostHelpful, setLocalMostHelpful] = useState<number | null>(null)
  const [localGuesserBoo, setLocalGuesserBoo] = useState<number | null>(null)

  useEffect(() => {
    setLocalLoves({})
    setLocalBoo(null)
    setLocalMostHelpful(null)
    setLocalGuesserBoo(null)
  }, [screen, asPlayerId])

  const buildPreviewRound = (base: RoundData): RoundData => {
    const baseLoves = base.cluePeerLoveVotes ?? {}
    const merged: RoundData = {
      ...base,
      cluePeerLoveVotes: { ...baseLoves, [asPlayerId]: localLoves },
      cluePeerBooVotes: localBoo !== null
        ? { ...(base.cluePeerBooVotes ?? {}), [asPlayerId]: localBoo }
        : (base.cluePeerBooVotes ?? {}),
      guesserMostHelpfulVote:
        localMostHelpful !== null ? localMostHelpful : base.guesserMostHelpfulVote ?? null,
      guesserBooVote:
        localGuesserBoo !== null ? localGuesserBoo : base.guesserBooVote ?? null,
    }
    return withMostHelpfulPoints(merged)
  }

  const previewRound = scenario.round ? buildPreviewRound(scenario.round) : null

  const onLoveToggle = (groupIdx: number) => {
    setLocalLoves((prev) => {
      const key = String(groupIdx)
      if (prev[key]) {
        const { [key]: _, ...rest } = prev
        return rest
      }
      if (localBoo === groupIdx) setLocalBoo(null)
      return { ...prev, [key]: true }
    })
  }

  const onBooToggle = (groupIdx: number) => {
    setLocalBoo((prev) => {
      const next = prev === groupIdx ? null : groupIdx
      if (next === groupIdx && localLoves[String(groupIdx)]) {
        setLocalLoves((l) => {
          const { [String(groupIdx)]: _, ...rest } = l
          return rest
        })
      }
      return next
    })
  }

  const onMostHelpfulVote = (groupIdx: number) => {
    setLocalMostHelpful((prev) => prev === groupIdx ? null : groupIdx)
  }

  const onGuesserBoo = (groupIdx: number) => {
    setLocalGuesserBoo((prev) => prev === groupIdx ? null : groupIdx)
  }

  const setAsPlayer = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('as', id)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen, asPlayerId, scenario.game.status, previewRound?.status, scenario.isFinal, scenario.showLeaderboard])

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <div className="bg-secondary text-on-secondary text-center text-[11px] font-label font-bold py-1.5 px-3 tracking-wide">
        ⚠️ Awards UX Prototype — votes are local only, nothing is saved
      </div>

      <div className="sticky top-0 z-[100] border-b border-outline-variant/60 bg-surface-container-high px-3 py-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/dev/fowl-words"
              className="text-xs font-bold text-primary shrink-0 font-label uppercase tracking-wide"
            >
              UI Preview
            </Link>
            <span className="text-outline text-xs truncate font-body">
              Fowl Words · 10 players · guesser: Bob
            </span>
          </div>
          <Link to="/" className="text-xs text-on-surface-variant underline shrink-0 font-body">
            Home
          </Link>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {FOWL_WORDS_PREVIEW_SCREENS.map(({ id, label }) => (
            <Link
              key={id}
              to={`/dev/fowl-words/${id}?as=${asPlayerId}`}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-body transition-colors ${
                screen === id
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <span className="text-[10px] font-label uppercase tracking-widest text-secondary shrink-0">
            View as
          </span>
          {PREVIEW_PLAYERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setAsPlayer(p.id)}
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-body transition-colors ${
                asPlayerId === p.id
                  ? 'bg-secondary-fixed text-on-secondary-fixed font-semibold'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              {p.name}
              {p.id === 'p1' && ' ★'}
              {p.id === PREVIEW_GUESSER_ID && ' 🔍'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        {screen === 'lobby' && (
          <Lobby
            game={scenario.game}
            players={scenario.players}
            isHost={scenario.isHost}
            currentPlayer={currentPlayer}
          />
        )}

        {scenario.isFinal && scenario.game.status === 'finished' && (
          <Scoreboard
            game={scenario.game}
            players={scenario.players}
            isHost={scenario.isHost}
            isFinal
          />
        )}

        {!scenario.isFinal && scenario.game.status !== 'lobby' && previewRound && (
          <div className="min-h-[calc(100vh-120px)] flex flex-col bg-surface linen-texture">
            <GameHeader
              game={scenario.game}
              players={scenario.players}
              round={previewRound}
              currentPlayer={currentPlayer}
              isHost={scenario.isHost}
            />

            {(previewRound.status === 'word-selection' || previewRound.status === 'word-selected') && (
              <WordSelectionView
                game={scenario.game}
                round={previewRound}
                players={scenario.players}
                currentPlayerId={scenario.currentPlayerId}
                isGuesser={isGuesser}
                isHost={scenario.isHost}
              />
            )}

            {previewRound.status === 'clue-submission' && (
              <ClueSubmissionView
                game={scenario.game}
                round={previewRound}
                players={scenario.players}
                currentPlayer={currentPlayer}
                isGuesser={isGuesser}
                isHost={scenario.isHost}
              />
            )}

            {previewRound.status === 'deduplication' && (
              <DeduplicationView round={previewRound} isGuesser={isGuesser} />
            )}

            {previewRound.status === 'reveal' && (
              <RevealView
                game={scenario.game}
                round={previewRound}
                players={scenario.players}
                currentPlayer={currentPlayer}
                isGuesser={isGuesser}
                isHost={scenario.isHost}
                onLoveToggle={onLoveToggle}
                onBooToggle={onBooToggle}
              />
            )}

            {previewRound.status === 'guess' && (
              <GuessView
                game={scenario.game}
                round={previewRound}
                players={scenario.players}
                isGuesser={isGuesser}
                currentPlayerId={scenario.currentPlayerId}
              />
            )}

            {previewRound.status === 'scored' && (
              <RoundResultView
                game={scenario.game}
                round={previewRound}
                players={scenario.players}
                isHost={scenario.isHost}
                currentPlayerId={scenario.currentPlayerId}
                onMostHelpfulVote={onMostHelpfulVote}
                onGuesserBoo={onGuesserBoo}
              />
            )}
          </div>
        )}

        {scenario.showLeaderboard && scenario.round && (
          <LeaderboardModal
            game={scenario.game}
            players={scenario.players}
            currentPlayerId={scenario.currentPlayerId}
            onClose={() => {}}
          />
        )}
      </div>
    </div>
  )
}
