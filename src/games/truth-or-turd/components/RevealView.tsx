import type { GameData, PlayerData, RoundData, TruthOrTurdAnswer, TruthOrTurdChoice } from '../types'
import { advanceRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

const ANSWER_LABEL: Record<TruthOrTurdAnswer, string> = {
  truth: 'Truth',
  turd: 'Turd',
}

export default function RevealView({ game, round, players, isHost, currentPlayerId }: Props) {
  if (round.status === 'revealing') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center space-y-3">
          <img src="/images/generated-comic/hen-pecking.png" alt="" className="w-20 h-20 mx-auto animate-hen-peck" />
          <p className="font-headline text-xl font-bold text-on-surface">Checking the droppings...</p>
          <p className="text-outline text-sm font-body">The facts are being sorted</p>
        </div>
      </main>
    )
  }

  const isMultipleChoice = round.kind === 'multiple-choice'
  const choices = isMultipleChoice ? round.choices ?? [] : ([
    { id: 'truth', text: 'Truth' },
    { id: 'turd', text: 'Turd' },
  ] satisfies TruthOrTurdChoice[])
  const correctAnswer = isMultipleChoice ? round.correctChoiceId ?? '' : round.correctAnswer ?? 'truth'
  const correctAnswerText = isMultipleChoice
    ? round.correctChoiceText ?? choices.find((choice) => choice.id === correctAnswer)?.text ?? 'Unknown'
    : ANSWER_LABEL[correctAnswer as TruthOrTurdAnswer]
  const isLastRound = game.currentRound >= game.settings.totalRounds
  const yourResult = currentPlayerId ? round.results?.[currentPlayerId] : undefined
  const yourAnswer = currentPlayerId ? round.playerAnswers?.[currentPlayerId] : undefined
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  const answerGroups = Object.fromEntries(choices.map((choice) => [choice.id, [] as string[]])) as Record<string, string[]>
  const noAnswerIds: string[] = []
  for (const player of players) {
    const answer = round.playerAnswers?.[player.id]
    if (answer && answerGroups[answer]) answerGroups[answer].push(player.id)
    else noAnswerIds.push(player.id)
  }

  const playerNameById = (id: string) => players.find((player) => player.id === id)?.name ?? id
  const answerText = (answerId?: string) => {
    if (!answerId) return ''
    if (isMultipleChoice) return choices.find((choice) => choice.id === answerId)?.text ?? answerId
    return ANSWER_LABEL[answerId as TruthOrTurdAnswer] ?? answerId
  }
  const choiceLabel = (index: number) => String.fromCharCode(65 + index)
  const renderNameChips = (playerIds: string[], answer?: string) => (
    <div className="flex flex-wrap gap-1.5">
      {playerIds.map((id) => {
        const isYou = id === currentPlayerId
        const youWereCorrect = answer === correctAnswer
        return (
          <span
            key={id}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium font-body ${
              isYou && youWereCorrect
                ? 'bg-primary text-on-primary font-bold'
                : isYou
                ? 'bg-error-container text-on-error-container font-bold ring-1 ring-error/70'
                : 'bg-surface-container-high text-on-surface'
            }`}
          >
            {playerNameById(id)}{isYou && ' ← you'}
          </span>
        )
      })}
    </div>
  )

  const hero = (() => {
    if (yourResult === 'correct') {
      return {
        img: '/images/generated-comic/truth-or-turd-correct.png',
        title: 'You nailed it!',
        detail: `You picked ${yourAnswer ? answerText(yourAnswer) : 'correctly'}.`,
        points: '+1 pt',
        cardClass: 'bg-primary-fixed border-primary',
        titleClass: 'text-on-primary-fixed',
        detailClass: 'text-on-primary-fixed-variant',
        chipClass: 'bg-primary text-on-primary',
      }
    }
    if (yourResult === 'incorrect') {
      return {
        img: '/images/generated-comic/truth-or-turd-wrong.png',
        title: 'You stepped in it',
        detail: `You picked ${yourAnswer ? answerText(yourAnswer) : 'the wrong side'}. Correct was ${correctAnswerText}.`,
        points: null,
        cardClass: 'bg-error-container/70 border-error',
        titleClass: 'text-on-error-container',
        detailClass: 'text-on-error-container',
        chipClass: 'bg-error text-on-error',
      }
    }
    if (yourResult === 'no-answer') {
      return {
        img: '/images/generated-comic/hen-sleeping.png',
        title: "You didn't answer",
        detail: `Correct was ${correctAnswerText}.`,
        points: null,
        cardClass: 'bg-surface-container-low border-outline-variant/60',
        titleClass: 'text-on-surface',
        detailClass: 'text-on-surface-variant',
        chipClass: 'bg-surface-container-high text-on-surface-variant',
      }
    }
    return null
  })()

  const handleAdvance = async () => {
    try {
      await advanceRound(game.id)
    } catch (err) {
      console.error('Failed to advance round:', err)
    }
  }

  return (
    <main className="flex-1 px-4 py-6 space-y-5">
      <section className="rounded-2xl border-2 p-5 text-center shadow-sm bg-surface-container-lowest border-outline-variant/60">
        <p className="font-headline text-xl font-bold text-on-surface leading-relaxed">
          {isMultipleChoice ? round.prompt : round.statement}
        </p>
      </section>

      {hero && (
        <section className={`rounded-2xl border-2 p-4 text-center shadow-sm ${hero.cardClass}`}>
          <div className="flex flex-col items-center gap-2">
            <img src={hero.img} alt="" className="w-24 h-24 animate-hen-pop" />
            <p className={`font-headline text-2xl font-bold ${hero.titleClass}`}>{hero.title}</p>
            <p className={`text-sm font-body ${hero.detailClass}`}>{hero.detail}</p>
            {hero.points && (
              <span className={`inline-block px-4 py-1 rounded-full text-sm font-bold font-body ${hero.chipClass}`}>
                {hero.points}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border-2 border-primary bg-primary-fixed p-5 text-center shadow-sm animate-correct-answer-stamp">
        <p className="font-label text-[10px] uppercase tracking-[0.2em] font-bold text-on-primary-fixed-variant mb-1">
          Correct answer
        </p>
        <p className={`font-headline font-bold text-on-primary-fixed ${isMultipleChoice ? 'text-2xl leading-tight' : 'text-4xl'}`}>
          {correctAnswerText}
        </p>
        {round.explanation && (
          <p className="mt-3 text-sm leading-relaxed font-body text-on-primary-fixed-variant">{round.explanation}</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-headline text-lg font-semibold text-primary px-1">Everyone&apos;s picks</h3>
        {choices.map((choice, index) => {
          const isCorrect = choice.id === correctAnswer
          const ids = answerGroups[choice.id] ?? []
          return (
            <div
              key={choice.id}
              className={`rounded-2xl p-4 shadow-sm border ${
                isCorrect ? 'bg-primary-fixed/20 border-primary' : 'bg-surface-container border-outline-variant/60'
              }`}
            >
              <div className="flex items-center gap-3 mb-2.5">
                {isMultipleChoice ? (
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-headline text-base font-bold ${
                    isCorrect ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-on-surface-variant'
                  }`}>
                    {choiceLabel(index)}
                  </span>
                ) : (
                  <span className={`material-symbols-outlined text-2xl ${isCorrect ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {isCorrect ? 'check_circle' : 'cancel'}
                  </span>
                )}
                <p className="font-headline text-base font-bold flex-1 text-on-surface">{choice.text}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  isCorrect ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {ids.length} {ids.length === 1 ? 'pick' : 'picks'}
                </span>
              </div>
              {ids.length > 0 ? renderNameChips(ids, choice.id) : (
                <p className="text-sm text-outline font-body italic">Nobody picked this one.</p>
              )}
            </div>
          )
        })}

        {noAnswerIds.length > 0 && (
          <div className="rounded-2xl p-4 shadow-sm bg-surface-container border border-outline-variant/60">
            <div className="flex items-center gap-3 mb-2.5">
              <span className="material-symbols-outlined text-2xl text-on-surface-variant">timer_off</span>
              <p className="font-headline text-base font-bold flex-1 text-on-surface-variant">No answer</p>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-surface-container-high text-on-surface-variant">
                Too slow
              </span>
            </div>
            {renderNameChips(noAnswerIds)}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
          Standings
        </h3>
        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 divide-y divide-outline-variant/50 overflow-hidden">
          {sortedPlayers.map((player, index) => {
            const earned = round.pointsThisRound?.[player.id] ?? 0
            const isYou = player.id === currentPlayerId
            return (
              <li key={player.id} className={`px-3 py-2 font-body flex items-center gap-2 ${isYou ? 'bg-secondary-fixed/20' : ''}`}>
                <span className="text-outline w-5 tabular-nums shrink-0 text-sm">{index + 1}.</span>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="font-medium text-on-surface truncate">{player.name}</span>
                  {isYou && <span className="text-xs text-on-surface-variant shrink-0">← you</span>}
                  {round.results?.[player.id] === 'correct' && (
                    <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-primary-fixed">+1</span>
                  )}
                  {round.results?.[player.id] === 'no-answer' && (
                    <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">No answer</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {earned > 0 && <span className="text-xs font-bold tabular-nums text-primary">+{earned}</span>}
                  <span className="font-headline text-lg font-bold tabular-nums text-on-surface w-8 text-right">{player.score}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="text-center pt-1">
        {isHost ? (
          <button
            type="button"
            onClick={handleAdvance}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 transition-all"
          >
            {isLastRound ? 'SEE FINAL STANDINGS' : 'NEXT ROUND'}
          </button>
        ) : (
          <p className="text-sm text-on-surface-variant font-body animate-pulse">Waiting for host to continue...</p>
        )}
      </div>
    </main>
  )
}
