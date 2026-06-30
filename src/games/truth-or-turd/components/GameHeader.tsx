import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { truthOrTurdAbandonGame } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  round: RoundData | null
  isHost: boolean
}

export default function GameHeader({ game, players, currentPlayer, round, isHost }: Props) {
  const [abandoning, setAbandoning] = useState(false)

  const handleAbandon = async () => {
    setAbandoning(true)
    try {
      await truthOrTurdAbandonGame(game.id)
    } catch (err) {
      console.error('Failed to abandon game:', err)
      setAbandoning(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm border-b border-outline-variant/60 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold">Truth or Turd</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-on-surface-variant font-body">
            <span>Room {game.code}</span>
            {round && <span>Round {game.currentRound} of {game.settings.totalRounds}</span>}
            {currentPlayer && <span>{currentPlayer.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-surface-container-low px-2 py-1 text-xs font-body text-on-surface-variant border border-outline-variant/60">
            {players.length}
          </span>
          {isHost && (
            <button
              type="button"
              onClick={handleAbandon}
              disabled={abandoning}
              className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant/60 text-on-surface-variant hover:text-error hover:border-error/70 disabled:opacity-50 transition-colors flex items-center justify-center"
              aria-label="End game"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
