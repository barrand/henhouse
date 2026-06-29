import { Link, useParams, useSearchParams } from 'react-router-dom'
import Lobby from '@flock/components/Lobby'
import GameHeader from '@flock/components/GameHeader'
import QuestionDisplay from '@flock/components/QuestionDisplay'
import RevealBoard from '@flock/components/RevealBoard'
import Scoreboard from '@flock/components/Scoreboard'
import LeaderboardModal from '@flock/components/LeaderboardModal'
import {
  FLOCK_PREVIEW_SCREENS,
  PREVIEW_PLAYERS,
  getFlockPreviewScenario,
  type FlockPreviewScreen,
} from './flockPreviewData'

const DEFAULT_SCREEN: FlockPreviewScreen = 'lobby'

function isValidScreen(s: string | undefined): s is FlockPreviewScreen {
  return FLOCK_PREVIEW_SCREENS.some((item) => item.id === s)
}

export default function FlockPreview() {
  const { screen: screenParam } = useParams<{ screen?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = isValidScreen(screenParam) ? screenParam : DEFAULT_SCREEN
  const asPlayerId = searchParams.get('as') ?? 'p1'
  const scenario = getFlockPreviewScenario(screen, asPlayerId)
  const currentPlayer = scenario.players.find((p) => p.id === scenario.currentPlayerId) ?? null

  const setAsPlayer = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('as', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Dev toolbar — not part of the game UI */}
      <div className="sticky top-0 z-[100] border-b border-outline-variant/60 bg-surface-container-high px-3 py-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/dev/flock" className="text-xs font-bold text-primary shrink-0 font-label uppercase tracking-wide">
              UI Preview
            </Link>
            <span className="text-outline text-xs truncate font-body">
              Flock Together · 10 players · {scenario.players.length} in room
            </span>
          </div>
          <Link to="/" className="text-xs text-on-surface-variant underline shrink-0 font-body">
            Home
          </Link>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {FLOCK_PREVIEW_SCREENS.map(({ id, label }) => (
            <Link
              key={id}
              to={`/dev/flock/${id}?as=${asPlayerId}`}
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
          <span className="text-[10px] font-label uppercase tracking-widest text-secondary shrink-0">View as</span>
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
            </button>
          ))}
        </div>
      </div>

      {/* Screen under review */}
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

        {!scenario.isFinal && scenario.game.status !== 'lobby' && (
          <div className="min-h-[calc(100vh-120px)] flex flex-col bg-surface linen-texture">
            <GameHeader
              game={scenario.game}
              players={scenario.players}
              currentPlayer={currentPlayer}
              round={scenario.round}
              isHost={scenario.isHost}
            />

            {scenario.round?.status === 'answering' && (
              <QuestionDisplay
                game={scenario.game}
                round={scenario.round}
                isHost={scenario.isHost}
                players={scenario.players}
                currentPlayerId={scenario.currentPlayerId}
                previewMode
              />
            )}

            {scenario.round &&
              (scenario.round.status === 'revealing' || scenario.round.status === 'scored') && (
                <RevealBoard
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
            players={scenario.players}
            currentPlayerId={scenario.currentPlayerId}
            onClose={() => {}}
          />
        )}
      </div>
    </div>
  )
}
