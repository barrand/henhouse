import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { startGame, updateCategories, setPatrioticMode, resetQuestionCooldowns, submitCustomQuestion, onCustomQuestionsUpdate } from '../service'
import CategoryInput from './CategoryInput'
import QuestionSubmission from './QuestionSubmission'

interface Props {
  game: GameData
  players: PlayerData[]
  isHost: boolean
  currentPlayer: PlayerData | null
}

export default function Lobby({ game, players, isHost, currentPlayer }: Props) {
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [customQuestions, setCustomQuestions] = useState<string[]>([])

  useEffect(() => {
    if (!game.id) return
    const unsub = onCustomQuestionsUpdate(game.id, setCustomQuestions)
    return unsub
  }, [game.id])

  const handleStart = async () => {
    if (players.length < 3) return setError('Need at least 3 players')
    setError('')
    setStarting(true)
    try {
      await startGame(game.id)
    } catch (err: any) {
      setError(err.message ?? 'Failed to start game')
      setStarting(false)
    }
  }

  const handleAddCategory = async (category: string) => {
    try {
      await updateCategories(game.id, [...game.categories, category])
    } catch (err: any) {
      setError(err.message ?? 'Failed to add category')
    }
  }

  const handleRemoveCategory = async (category: string) => {
    try {
      await updateCategories(game.id, game.categories.filter((c) => c !== category))
    } catch (err: any) {
      setError(err.message ?? 'Failed to remove category')
    }
  }

  const handleTogglePatrioticMode = async () => {
    try {
      await setPatrioticMode(game.id, !game.includePatrioticQuestions)
    } catch (err: any) {
      setError(err.message ?? 'Failed to update patriotic mode')
    }
  }

  const handleResetQuestionCooldowns = async () => {
    try {
      await resetQuestionCooldowns(game.id)
      setError('') // Clear any previous errors
    } catch (err: any) {
      setError(err.message ?? 'Failed to reset question cooldowns')
    }
  }

  const handleSubmitQuestion = async (text: string) => {
    try {
      await submitCustomQuestion(game.id, text)
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit question')
    }
  }

  const buttonLabel = starting
    ? 'Starting...'
    : players.length < 3
    ? `Need ${3 - players.length} more players`
    : 'Start Game'

  return (
    <div className="min-h-screen bg-surface linen-texture font-body text-on-surface relative overflow-hidden">
      {/* Background botanical decorations */}
      <div className="absolute -top-8 -left-8 opacity-[0.07] pointer-events-none -rotate-12">
        <img src="/images/botanical-fern.png" alt="" className="w-52 h-52 object-contain" />
      </div>
      <div className="absolute top-1/3 -right-12 opacity-[0.06] pointer-events-none rotate-[25deg]">
        <img src="/images/botanical-wheat.png" alt="" className="w-56 h-56 object-contain" />
      </div>
      <div className="absolute bottom-24 -left-16 opacity-[0.05] pointer-events-none rotate-[200deg]">
        <img src="/images/botanical-wheat.png" alt="" className="w-48 h-48 object-contain" />
      </div>
      <div className="absolute -bottom-6 -right-6 opacity-[0.07] pointer-events-none rotate-[140deg]">
        <img src="/images/botanical-fern.png" alt="" className="w-44 h-44 object-contain" />
      </div>

      <main className="max-w-md mx-auto px-6 pt-4 pb-32 relative z-10">
        {/* Header + Room Code */}
        <div className="text-center mb-8">
          <button
            onClick={() => navigate('/')}
            className="mb-4 inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-medium">Back</span>
          </button>
          <img src="/images/hen-neutral.svg" alt="" className="w-24 h-24 mx-auto mb-3 animate-hen-bob" />
          <h2 className="font-headline text-4xl font-bold text-on-surface mb-2 tracking-tight">FLOCK TOGETHER</h2>
          <p className="text-on-surface-variant text-sm">Waiting in the lobby</p>

          <div className="mt-6 inline-flex items-center gap-4 bg-surface-container-lowest px-8 py-4 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-outline-variant/10">
            <div className="flex flex-col items-center">
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-1">Room Code</span>
              <span className="font-headline text-3xl font-bold text-on-surface tracking-[0.3em]">{game.code}</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(game.code)}
              className="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-secondary hover:bg-tertiary-fixed-dim transition-colors"
            >
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </button>
          </div>
        </div>

        {/* Patriotic Edition Banner */}
        {game.includePatrioticQuestions && (
          <div className="mb-6 bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 text-center">
            <p className="font-headline text-lg font-bold text-on-surface">🇺🇸 Patriotic Edition is ON</p>
            <p className="text-on-surface-variant text-sm font-body mt-1">250th anniversary questions included</p>
          </div>
        )}

        {/* The Henhouse */}
        <section className="mb-8">
          <div className="flex justify-between items-end mb-3 px-1">
            <h3 className="font-headline text-xl font-semibold text-primary">
              The Henhouse <span className="text-on-surface-variant font-normal text-sm ml-1">({players.length})</span>
            </h3>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-outline-variant/60 relative overflow-hidden">
            <span className="material-symbols-outlined absolute -top-2.5 -left-2.5 opacity-15 -rotate-[15deg] text-primary text-6xl pointer-events-none">eco</span>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-3 relative z-10">
              {players.map((p) => (
                <li key={p.id} className="flex items-center min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-2 h-2 rounded-full ${p.connected ? 'bg-primary shadow-[0_0_8px_rgba(168,201,169,0.5)]' : 'bg-outline-variant'}`} />
                    <span className="font-medium truncate">
                      {p.name}
                      {(p.id === game.hostId || p.id === currentPlayer?.id) && (
                        <span className="text-on-surface-variant text-xs font-normal ml-1">
                          {p.id === game.hostId && '(host)'}
                          {p.id === currentPlayer?.id && ' ← you'}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
              <li className="col-span-2 pt-2 border-t border-outline-variant/10 text-center">
                <img src="/images/hen-neutral.svg" alt="" className="w-12 h-12 mx-auto mb-1 opacity-70 animate-hen-bob" />
                <p className="italic text-on-surface-variant text-sm">Waiting for others...</p>
              </li>
            </ul>
            <span className="material-symbols-outlined absolute -bottom-4 -right-4 opacity-15 rotate-[165deg] text-primary text-6xl pointer-events-none">account_tree</span>
          </div>
        </section>

        {/* Patriotic Mode Toggle */}
        {isHost && (
          <section className="mb-8 space-y-3">
            <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/60 flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-headline text-base font-semibold text-on-surface mb-1">🎆 Add patriotic flavor to the game</h4>
                <p className="text-xs text-on-surface-variant">Include America's 250th anniversary questions</p>
              </div>
              <button
                onClick={handleTogglePatrioticMode}
                className={`ml-4 w-12 h-6 rounded-full transition-colors flex items-center ${
                  game.includePatrioticQuestions
                    ? 'bg-primary'
                    : 'bg-outline-variant'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-surface-container transition-transform ${
                  game.includePatrioticQuestions ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            <button
              onClick={handleResetQuestionCooldowns}
              className="w-full bg-surface-container-low hover:bg-surface-container p-3 rounded-xl border border-outline-variant/60 transition-colors flex items-center justify-center gap-2 text-on-surface text-sm font-medium"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Reset Question Cooldowns
            </button>
          </section>
        )}

        {/* Bonus Categories */}
        <section className="mb-8">
          <CategoryInput
            categories={game.categories}
            editable={isHost}
            onAdd={handleAddCategory}
            onRemove={handleRemoveCategory}
          />
        </section>

        {/* Submit Question */}
        <section className="mb-12">
          <QuestionSubmission
            onSubmit={handleSubmitQuestion}
            submittedQuestions={customQuestions}
          />
        </section>

        {error && <p className="text-center text-error text-sm mb-4">{error}</p>}
      </main>

      {/* Fixed Bottom Action */}
      {isHost ? (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/95 to-transparent z-40">
          <div className="max-w-md mx-auto">
            <button
              onClick={handleStart}
              disabled={starting || players.length < 3}
              className="w-full bg-primary text-on-primary h-16 rounded-xl font-headline font-bold text-lg shadow-[0_12px_32px_rgba(0,0,0,0.4)] flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-transform duration-200"
            >
              <span>{buttonLabel}</span>
              {players.length >= 3 && !starting && (
                <span className="material-symbols-outlined">play_arrow</span>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/95 to-transparent z-40">
          <div className="max-w-md mx-auto text-center">
            <p className="text-on-surface-variant animate-pulse">Waiting for host to start...</p>
          </div>
        </div>
      )}
    </div>
  )
}
