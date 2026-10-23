import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import LeaderboardModal from './LeaderboardModal'
import { fowlWordsAbandonGame } from '../service'
import ScoringSettings from './ScoringSettings'

interface Props {
  game: GameData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  round: RoundData | null
  isHost: boolean
}

export default function GameHeader({ game, players, currentPlayer, round: _round, isHost }: Props) {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const guesserName = guesserPlayer?.name ?? '…'
  const isMyTurn = game.currentGuesser === currentPlayer?.id

  const handleAbandon = async () => {
    setAbandoning(true)
    try {
      await fowlWordsAbandonGame(game.id)
    } catch {
      setAbandoning(false)
      setConfirming(false)
    }
  }

  return (
    <>
      <div className="game-header sticky top-0 z-10 px-4 py-2">
        <div className="flex justify-between items-center text-sm font-body">
          <span>Round {game.currentRound} of {game.settings.totalRounds}</span>
          <span className="room-code">{game.code}</span>
        </div>

        {confirming ? (
          <div className="flex items-center justify-between mt-1 py-0.5">
            <span className="text-sm font-body opacity-90">End game for everyone?</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="text-sm font-body hover:text-cream"
              >
                Cancel
              </button>
              <button
                onClick={handleAbandon}
                disabled={abandoning}
                className="text-sm font-body font-bold bg-error text-on-error px-3 py-0.5 rounded-lg hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
              >
                {abandoning ? 'Ending…' : 'End game'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center mt-1">
            <div className="flex items-center gap-2 font-body text-sm">
              {isMyTurn ? (
                <span className="flex items-center gap-1 bg-primary text-on-primary text-xs px-2 py-0.5 rounded-full font-bold font-label">
                  👀 YOU'RE GUESSING
                </span>
              ) : (
                <span>
                  <span className="font-bold">{guesserName}</span> is guessing
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isHost && game.scoringEngineVersion === 1 && (
                <button onClick={() => setShowSettings(true)} className="min-h-11 text-sm underline">Settings</button>
              )}
              {isHost && (
                <button
                  onClick={() => setConfirming(true)}
                  className="text-xs text-error font-body transition-opacity"
                >
                  End game
                </button>
              )}
              <button
                onClick={() => setShowLeaderboard(true)}
                className="text-sm underline hover:text-cream font-body"
              >
                Standings
              </button>
            </div>
          </div>
        )}
      </div>

      {game.scoringEngineVersion === 1 && game.pendingScoringRules && <p className="bg-tertiary-container text-on-tertiary-container px-4 py-2 text-sm" role="status">Next round: {game.pendingScoringRules.mode === 'classic' ? 'Classic' : 'Best Clues First'} · updated rules</p>}
      {game.scoringEngineVersion === 1 && game.scoringChangedRound === game.currentRound && <p className="bg-primary-fixed text-on-primary-fixed px-4 py-2 text-sm" role="status">Round {game.currentRound}: {game.scoringRules?.mode === 'best-clues-first' ? 'Best Clues First' : 'Classic'} settings are active.</p>}
      {showSettings && <ScoringSettings game={game} onClose={() => setShowSettings(false)} />}

      {showLeaderboard && (
        <LeaderboardModal
          game={game}
          players={players}
          currentPlayerId={currentPlayer?.id ?? null}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </>
  )
}
