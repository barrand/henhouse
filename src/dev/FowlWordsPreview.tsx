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

export default function FowlWordsPreview() {
  const { screen: screenParam } = useParams<{ screen?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = isValidScreen(screenParam) ? screenParam : DEFAULT_SCREEN
  const asPlayerId = searchParams.get('as') ?? 'p1'
  const scenario = getFowlWordsPreviewScenario(screen, asPlayerId)
  const currentPlayer = scenario.players.find((p) => p.id === scenario.currentPlayerId) ?? null
  const isGuesser = scenario.game.currentGuesser === scenario.currentPlayerId

  const setAsPlayer = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('as', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
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

        {!scenario.isFinal && scenario.game.status !== 'lobby' && scenario.round && (
          <div className="min-h-[calc(100vh-120px)] flex flex-col bg-surface linen-texture">
            <GameHeader
              game={scenario.game}
              players={scenario.players}
              round={scenario.round}
              currentPlayer={currentPlayer}
              isHost={scenario.isHost}
            />

            {scenario.round.status === 'word-selection' && (
              <WordSelectionView
                game={scenario.game}
                round={scenario.round}
                players={scenario.players}
                isGuesser={isGuesser}
                isHost={scenario.isHost}
              />
            )}

            {scenario.round.status === 'clue-submission' && (
              <ClueSubmissionView
                game={scenario.game}
                round={scenario.round}
                players={scenario.players}
                currentPlayer={currentPlayer}
                isGuesser={isGuesser}
                isHost={scenario.isHost}
              />
            )}

            {scenario.round.status === 'deduplication' && (
              <DeduplicationView round={scenario.round} isGuesser={isGuesser} />
            )}

            {scenario.round.status === 'reveal' && (
              <RevealView
                game={scenario.game}
                round={scenario.round}
                players={scenario.players}
                currentPlayer={currentPlayer}
                isGuesser={isGuesser}
                isHost={scenario.isHost}
              />
            )}

            {scenario.round.status === 'guess' && (
              <GuessView
                game={scenario.game}
                round={scenario.round}
                players={scenario.players}
                isGuesser={isGuesser}
                currentPlayerId={scenario.currentPlayerId}
              />
            )}

            {scenario.round.status === 'scored' && (
              <RoundResultView
                game={scenario.game}
                round={scenario.round}
                players={scenario.players}
                isHost={scenario.isHost}
                currentPlayerId={scenario.currentPlayerId}
              />
            )}
          </div>
        )}

        {scenario.showLeaderboard && (
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
