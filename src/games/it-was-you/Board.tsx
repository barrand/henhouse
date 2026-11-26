import type { DisplayRound, Round, VoteCounts } from './types'

interface BoardProps {
  round: DisplayRound | Round
  now: number
  name: (id: string) => string
  counts: VoteCounts
  voted: number
  selected?: string
  pending?: boolean
  onVote?: (id: string) => void
  television?: boolean
}

export function ItWasYouBoard({ round, now, name, counts, voted, selected, pending, onVote, television }: BoardProps) {
  const reveal = round.reveal
  const shown = reveal && now >= reveal.revealAt
  const eligible = 'eligible' in round ? round.eligible : round.eligiblePlayerIds.length
  const writers = 'writers' in round ? round.writers : round.writerIds.length
  const publicCounts = reveal?.counts ?? counts
  const total = reveal ? Object.values(publicCounts).reduce((sum, count) => sum + count, 0) : voted
  const seconds = Math.max(0, Math.ceil((round.deadline - now) / 1000))
  const roomCorrect = shown && reveal.leaders.length === 1 && reveal.leaders[0] === reveal.authorId
  const heading = television ? 'display-question' : 'font-headline text-2xl sm:text-3xl font-bold'
  const showBallot = round.phase === 'voting' || (reveal && !reveal.automatic)
  return (
    <section className={television ? 'display-panel space-y-4' : 'rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5 space-y-4'}>
      <p className={round.answer ? (television ? 'text-on-surface-variant text-lg sm:text-2xl font-medium' : 'text-on-surface-variant text-sm font-medium') : heading}>{round.prompt}</p>
      {round.deadline > 0 && <p role="timer" className={"font-headline font-bold text-timer tabular-nums" + (television ? " text-2xl" : "")}>
        {seconds === 0 ? 'Time’s up' : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')}
      </p>}
      {round.phase === 'writing' && <p className="text-on-surface-variant">{round.submitted} of {writers} answers in</p>}
      {round.answer && <blockquote className={heading + ' wrap-anywhere'}>{round.answer.text}</blockquote>}
      {round.phase === 'voting' && <p className={television ? "text-lg font-bold" : "font-bold"}>{total} of {eligible} voted</p>}
      {reveal && (
        <div className="space-y-2" aria-live="polite">
          {!reveal.automatic && <p className="text-on-surface-variant">{reveal.leaders.length === 1
            ? 'The room picked ' + name(reveal.leaders[0]) + '.'
            : reveal.leaders.length ? 'The vote tied.' : 'The room passed.'}</p>}
          {shown ? <div className="flex flex-wrap items-center gap-4"><div>
            <p className={heading + ' animate-hen-pop'}>{name(reveal.authorId)} wrote it!</p>
            <p className="text-on-surface-variant">{reveal.automatic ? 'Last answer · 0 points' : roomCorrect ? 'The room got it right!' : 'Right guesses earn 1 point.'}</p>
            </div><img className="h-16 w-16 shrink-0 animate-hen-pop object-contain" src="/images/generated-comic/midnight/hen-excited.png" alt="" />
          </div> : <p className="font-bold">And the author is…</p>}
        </div>
      )}
      {showBallot && <ul className="space-y-2" aria-label="Votes by player">
        {round.candidateIds.map(id => {
          const count = Math.max(0, publicCounts[id] ?? 0)
          const leader = reveal?.leaders.includes(id)
          const author = shown && reveal.authorId === id
          const yourPick = selected === id
          const roomPick = shown && !reveal.automatic && reveal.leaders.length === 1 && leader
          const active = selected === id || author || leader
          const row = 'relative isolate flex min-h-12 w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-2 text-left font-bold ' +
            (television ? 'text-xl ' : '') + (author ? 'border-2 border-primary bg-surface-container-high' : active ? 'border-primary bg-surface-container-high' : 'border-outline-variant/60 bg-surface-container-low')
          const content = <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 -z-10 bg-primary/20" style={{ width: (total ? Math.min(100, count / total * 100) : 0) + '%' }} />
            <span className="min-w-0 space-y-1">
              <span className="block wrap-anywhere">{name(id)}{author ? ' · Author' : ''}</span>
              {(yourPick || roomPick) && <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                {yourPick && <span className={shown && author ? 'rounded-full bg-primary-fixed px-2 py-1 text-on-primary-fixed' : 'rounded-full bg-surface-container-highest px-2 py-1 text-on-surface'}>
                  {shown && author ? '✓ Your guess was right' : 'Your pick'}
                </span>}
                {roomPick && <span className={author ? 'rounded-full bg-secondary-fixed px-2 py-1 text-on-secondary-fixed' : 'rounded-full bg-surface-container-highest px-2 py-1 text-on-surface'}>
                  {author ? '✓ Room got it right' : 'Room’s pick'}
                </span>}
              </span>}
            </span>
            <span className="shrink-0 tabular-nums" aria-label={count + ' votes'}>{count}</span>
          </>
          return <li key={id}>{onVote && round.phase === 'voting'
            ? <button type="button" className={row + ' hover:border-primary disabled:opacity-70'} aria-pressed={selected === id}
              disabled={pending || seconds === 0} onClick={() => onVote(id)}>{content}</button>
            : <div className={row}>{content}</div>}</li>
        })}
      </ul>}
    </section>
  )
}

export function Rankings({ players, points }: { players: { id: string; name: string; score: number }[]; points?: VoteCounts }) {
  const ordered = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const positions = new Map<number, number>()
  for (const [index, player] of ordered.entries()) {
    if (!positions.has(player.score)) positions.set(player.score, index + 1)
  }
  return <ol className="space-y-2">
    {ordered.map(player => {
      const earned = points?.[player.id] ?? 0
      return <li key={player.id} className="flex justify-between gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-low px-4 py-2">
        <span className="min-w-0 wrap-anywhere">{positions.get(player.score)}. {player.name}</span>
        <span className="shrink-0 tabular-nums">{player.score}{earned > 0 && <span className="ml-3 text-primary">+{earned}</span>}</span>
      </li>
    })}
  </ol>
}
