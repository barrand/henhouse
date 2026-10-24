import { useState, useEffect } from 'react'
import BottomActionDock from '../../../shared/BottomActionDock'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { startGame, updateCategories, resetQuestionCooldowns, submitCustomQuestion, onCustomQuestionsUpdate, setCuratedQuestions } from '../service'
import curatedQuestionData from '../../../../functions/src/games/flock-together/data/curated-questions.json'
import CategoryInput from './CategoryInput'
import QuestionSubmission from './QuestionSubmission'

const curatedQuestions: { text: string; options?: string[] }[] = curatedQuestionData

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
  const [updatingCurated, setUpdatingCurated] = useState(false)

  useEffect(() => {
    if (!game.id) return
    const unsub = onCustomQuestionsUpdate(game.id, setCustomQuestions)
    return unsub
  }, [game.id])

  const handleStart = async () => {
    if (updatingCurated) return
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

  const handleCuratedToggle = async () => {
    setUpdatingCurated(true)
    setError('')
    try {
      await setCuratedQuestions(game.id, !game.curatedQuestions)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change question set')
    } finally {
      setUpdatingCurated(false)
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

      <main data-action-screen className="max-w-md mx-auto px-6 pt-4 pb-6 relative z-10">
        {/* Header + Room Code */}
        <div className="text-center mb-8">
          <button
            onClick={() => navigate('/')}
            className="mb-4 inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-medium">Back</span>
          </button>
          <img src="/images/generated-comic/midnight/hen-neutral.png" alt="" className="w-24 h-24 mx-auto mb-3 animate-hen-bob" />
          <h2 className="font-headline text-4xl font-bold text-on-surface mb-2 tracking-tight">FLOCK TOGETHER</h2>
          <p className="text-on-surface-variant text-sm">Waiting in the lobby</p>

          <div className="room-sticker mt-6 inline-flex items-center gap-4 bg-surface-container-lowest px-8 py-4 rounded-xl shadow-sticker border border-outline-variant">
            <div className="flex flex-col items-center">
              <span className="font-label text-[11px] uppercase tracking-[0.2em] text-info mb-1">Room Code</span>
              <span className="room-code text-3xl">{game.code}</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(game.code)}
              aria-label="Copy room code"
              className="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed hover:bg-tertiary-fixed-dim transition-colors"
            >
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </button>
          </div>
        </div>

        {/* Patriotic Edition Banner */}
        {game.includePatrioticQuestions && !game.curatedQuestions && (
          <div className="mb-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-center">
            <p className="font-headline text-lg font-bold text-on-surface">Patriotic Edition is ON</p>
            <p className="text-on-surface-variant text-sm font-body mt-1">250th anniversary questions every other round</p>
          </div>
        )}

        {/* The Henhouse */}
        <section className="mb-8">
          <div className="flex justify-between items-end mb-3 px-1">
            <h3 className="font-headline text-xl font-semibold text-primary">
              The Henhouse <span className="text-on-surface-variant font-normal text-sm ml-1">({players.length})</span>
            </h3>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sticker border border-outline-variant relative overflow-hidden">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-3 relative z-10">
              {players.map((p) => (
                <li key={p.id} className="animate-hen-pop flex items-center min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-2 h-2 rounded-full ${p.connected ? 'bg-success' : 'bg-outline-variant'}`} />
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
              <li className="col-span-2 pt-2 border-t border-outline-variant text-center">
                <p className="italic text-on-surface-variant text-sm">Waiting for others...</p>
              </li>
            </ul>
          </div>
        </section>

        {/* Question selection is visible and editable only by the host. */}
        {isHost && (
          <section className="mb-8 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 id="curated-questions-label" className="font-headline text-lg font-semibold text-primary">Curated questions</h3>
                <p id="curated-questions-description" className="mt-1 text-sm text-on-surface-variant">
                  {curatedQuestions.length > 10
                    ? `${curatedQuestions.length} handpicked questions. Each game draws ten in a fresh order.`
                    : `${curatedQuestions.length} handpicked questions, played in order.`}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!game.curatedQuestions}
                aria-labelledby="curated-questions-label"
                aria-describedby="curated-questions-description"
                disabled={starting || updatingCurated}
                onClick={handleCuratedToggle}
                className={`flex h-11 w-16 shrink-0 items-center rounded-full border-2 p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 ${game.curatedQuestions ? 'border-primary bg-primary' : 'border-outline bg-surface-container-high'}`}
              >
                <span className={`h-7 w-7 rounded-full transition-transform ${game.curatedQuestions ? 'translate-x-5 bg-on-primary' : 'bg-outline'}`} />
              </button>
            </div>
            <p className="mt-3 text-sm text-on-surface-variant" aria-live="polite">
              {updatingCurated ? 'Saving question set...' : game.curatedQuestions ? 'Curated set on. Only these questions will be played.' : 'Off. Play from the standard question pool.'}
            </p>
            <details className="mt-3 border-t border-outline-variant/60 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-on-surface">Preview the curated set</summary>
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-on-surface">
                {curatedQuestions.map((question) => (
                  <li key={question.text}>
                    <p>{question.text}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {question.options?.join(' · ') ?? "Answer with a player's name."}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}

        {/* Host Tools */}
        {isHost && (
          <section className="mb-8">
            <button
              onClick={handleResetQuestionCooldowns}
              className="w-full bg-surface-container-low hover:bg-surface-container p-3 rounded-xl border border-outline-variant transition-colors flex items-center justify-center gap-2 text-on-surface text-sm font-medium"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Reset Question Cooldowns
            </button>
          </section>
        )}

        {/* Bonus Categories */}
        {!game.curatedQuestions && <section className="mb-8">
          {game.aiExperiment && game.aiExperiment.mode !== 'legacy' ? <p className="text-sm text-on-surface-variant">Jev playtest uses preset or manually submitted questions. AI-generated categories require the normal game.</p> : <CategoryInput
            categories={game.categories}
            editable={isHost}
            onAdd={handleAddCategory}
            onRemove={handleRemoveCategory}
          />}
        </section>}

        {/* Submit Question */}
        {!game.curatedQuestions && <section className="mb-12">
          <QuestionSubmission
            onSubmit={handleSubmitQuestion}
            submittedQuestions={customQuestions}
          />
        </section>}

        {error && <p className="text-center text-error text-sm mb-4">{error}</p>}

      {/* Fixed Bottom Action */}
      {isHost ? (
        <BottomActionDock>
          <div className="max-w-md mx-auto">
            <button
              onClick={handleStart}
              disabled={starting || updatingCurated || players.length < 3}
              className="w-full bg-action text-on-action h-16 rounded-xl font-headline font-bold text-lg shadow-sticker flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-transform duration-200"
            >
              <span>{buttonLabel}</span>
              {players.length >= 3 && !starting && (
                <span className="material-symbols-outlined">play_arrow</span>
              )}
            </button>
          </div>
        </BottomActionDock>
      ) : (
        <BottomActionDock>
          <div className="max-w-md mx-auto text-center">
            <p className="text-on-surface-variant animate-pulse">Waiting for host to start...</p>
          </div>
        </BottomActionDock>
      )}
      </main>
    </div>
  )
}
