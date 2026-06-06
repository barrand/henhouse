import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import LeaderboardModal from './LeaderboardModal'

interface Props {
  game: GameData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  round: RoundData | null
}

export default function GameHeader({ game, players, currentPlayer, round: _round }: Props) {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const guesserName = guesserPlayer?.name ?? '…'
  const isMyTurn = game.currentGuesser === currentPlayer?.id

  return (
    <>
      <div className="sticky top-0 z-10 bg-primary-container text-on-primary-container px-4 py-2">
        <div className="flex justify-between items-center text-sm font-body">
          <span>Round {game.currentRound} of {game.settings.totalRounds}</span>
          <span className="font-bold tracking-wider">{game.code}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex items-center gap-2 font-body text-sm">
            {isMyTurn ? (
              <span className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container text-xs px-2 py-0.5 rounded-full font-bold font-label">
                👀 YOU'RE GUESSING
              </span>
            ) : (
              <span>
                <span className="font-bold">{guesserName}</span> is guessing
              </span>
            )}
          </div>
          <button
            onClick={() => setShowLeaderboard(true)}
            className="text-sm underline opacity-80 hover:opacity-100 font-body"
          >
            Standings
          </button>
        </div>
      </div>

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
