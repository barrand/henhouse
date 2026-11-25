import { useEffect, useRef, useState } from 'react'
import type { DisplayClue, FlockDisplayRound, FowlDisplayRound } from '../../../functions/src/shared/sharedViewModel'
import { useClueReactions } from '@fowl-words/components/useClueReactions'
import { flockReveal, fowlReveal } from '../revealTimeline'
import { DisplayPager } from './DisplayPager'
import { paginate } from './displayLayout'
import { useRankMotion } from './useRankMotion'

interface BoardProps {
  now: number
  width: number
  height: number
  name: (id: string) => string
}

export function Hen({ art, motion = 'bob' }: { art: string; motion?: 'bob' | 'peck' | 'celebrate' | 'pop' | 'still' }) {
  const animation = {
    bob: 'animate-hen-bob', peck: 'animate-hen-peck',
    celebrate: 'animate-hen-celebrate', pop: 'animate-hen-pop', still: '',
  }[motion]
  return <img src={'/images/generated-comic/midnight/' + art + '.png'} alt="" className={'display-hen ' + animation} />
}

function Timer({ deadline, now }: { deadline: number; now: number }) {
  if (!deadline) return null
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  const text = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
  return <span role="timer" className={'display-timer ' + (seconds === 5 ? 'animate-hen-pop' : '')}>{text}</span>
}

function Eggs({ value, total, label }: { value: number; total: number; label: string }) {
  return <div className="space-y-2">
    <div className="display-eggs" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => <span key={index} className={'display-egg ' + (index < value ? 'display-egg-filled' : '')} />)}
    </div>
    <p className="font-bold text-primary">{value} of {total} {label}</p>
  </div>
}

function nameLines(ids: string[], name: BoardProps['name'], size: number) {
  const pages = paginate(ids, size, id => name(id).length + 3)
  return pages.map(page => page.map(name).join(' · '))
}

export function FlockBoard({ round, now, width, height, name }: BoardProps & { round: FlockDisplayRound }) {
  const { groups, phase, revealAt } = round
  const reveal = flockReveal(groups, revealAt, now)
  const winner = groups.find(group => group.type === 'flock')
  const wide = width >= 900
  const compact = groups.length > 4
  const capacity = wide ? (height >= 780 ? 10 : 7) : (width >= 560 ? 6 : 5)
  const rows = groups.map(group => ({ id: group.id, group, authors: group.playerIds.map(name).join(' · ') }))
  const lineLength = wide && !compact ? 95 : 56
  const pages = paginate(rows, capacity, ({ group, authors }) =>
    Math.max(1, Math.ceil((group.answer.length + authors.length) / lineLength)),
  )

  return <section className="display-panel display-board space-y-5">
    <div className="display-stage-title">
      <h2 className="display-question">{round.question}</h2>
      {phase === 'answering' && <Timer deadline={round.deadline} now={now} />}
    </div>
    {phase === 'answering' && <>
      {round.options.length > 0 && <ul className="display-choices">{round.options.map(option => <li key={option}>{option}</li>)}</ul>}
      <div className="display-waiting">
        <div className="space-y-4">
          <p className="text-on-surface-variant">Answer on your phone</p>
          <Eggs value={round.answered} total={round.eligible} label="locked in" />
        </div>
        <Hen art="hen-thinking" />
      </div>
    </>}
    {(phase === 'revealing' || phase === 'skipped') && <div className="display-waiting">
      <p className="display-subtitle" role="status">{phase === 'skipped' ? 'Getting a new question…' : 'Counting the flock…'}</p>
      <Hen art="hen-pecking" motion="peck" />
    </div>}
    {phase === 'scored' && <>
      {reveal.landed ? (
        <div className={'display-outcome ' + (reveal.outcomeFresh ? 'animate-hen-pop' : '')}>
          <div>
            <h3 className="display-subtitle">{winner ? 'The flock' : 'No flock this round'}</h3>
            {winner ? <p className="text-primary font-bold wrap-anywhere">{winner.answer} · {winner.playerIds.length} picks</p>
              : <p className="text-on-surface-variant">{groups.length === round.answered && round.answered > 1 ? round.answered + ' different answers · ' : ''}Scores stay the same</p>}
          </div>
          <Hen art={winner ? 'hen-excited' : 'hen-confused'} motion={reveal.outcomeFresh ? 'pop' : 'still'} />
        </div>
      ) : <p role="status" className="text-info font-bold">The flock is being revealed…</p>}
      <DisplayPager pages={pages} label="Answers" ready={reveal.landed} auto={wide}>
        {items => <div className={'display-answer-grid ' + (compact ? 'display-answer-grid-compact' : '')}>
          {items.map(({ group, authors }) => (
            <article key={group.id} className={[
              'display-answer', group.type === 'flock' && 'display-answer-winning',
              reveal.fresh(group.id) && (group.type === 'rotten' ? 'animate-card-shake' : 'animate-hen-pop'),
            ].filter(Boolean).join(' ')} hidden={!reveal.visible(group.id)}>
              <div className="display-answer-text">{group.answer}</div>
              <div className="display-authors">{authors}</div>
              {group.playerIds.length > 1 && <span className="display-count">{group.playerIds.length} picks</span>}
              {group.type === 'rotten' && <span className="display-count text-error">−1</span>}
              {group.type === 'flock' && (round.points[group.playerIds[0]] ?? 0) > 0 && <span className="display-count">+{round.points[group.playerIds[0]]} each</span>}
            </article>
          ))}
        </div>}
      </DisplayPager>
      {reveal.landed && round.missing.length > 0 && <details className="text-on-surface-variant">
        <summary className="cursor-pointer">{round.missing.length} missed this round</summary>
        <p className="wrap-anywhere">{round.missing.map(name).join(' · ')}</p>
      </details>}
    </>}
  </section>
}

function orderedIds(clues: DisplayClue[]) {
  return [...clues].sort((a, b) => b.loves - a.loves).map(clue => clue.id).join(',')
}

function useHeartOrder(clues: DisplayClue[], live: boolean) {
  const desired = orderedIds(clues)
  const [current, setCurrent] = useState(desired)
  useEffect(() => {
    if (!live || current === desired) return
    const timer = setTimeout(() => setCurrent(desired), 320)
    return () => clearTimeout(timer)
  }, [current, desired, live])
  const positions = new Map((live ? current : desired).split(',').map((id, index) => [id, index]))
  return [...clues].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity))
}

function ClueBadges({ clue }: { clue: DisplayClue }) {
  return <div className="display-reactions">
    {clue.loves > 0 && <span className="display-love" aria-label={clue.loves + ' hearts'}>❤️ {clue.loves}</span>}
    {clue.boos > 0 && <span className="display-boo" aria-label={clue.boos + ' boos'}>👎 {clue.boos}</span>}
    {clue.helpful && <span data-helpful className="display-helpful">⭐ Most Helpful</span>}
  </div>
}

function LiveClues({ clues, identity }: { clues: DisplayClue[]; identity: string }) {
  const root = useRef<HTMLDivElement>(null)
  const ordered = useHeartOrder(clues, true)
  useClueReactions(clues, root, identity, true)
  useRankMotion(root, ordered.map(clue => clue.id).join(','))
  return <div ref={root} className={'display-clue-grid ' + (clues.length > 8 ? 'display-clue-grid-dense' : '')}>
    {ordered.map(clue => <article key={clue.id} data-reaction={clue.id} data-ranking={clue.id}
      className={['display-clue', clue.loves > 0 && 'display-hearted', clue.newlyShown && 'display-just-unlocked animate-hen-pop'].filter(Boolean).join(' ')}>
      {clue.newlyShown && <span className="display-new-clue">Just unlocked</span>}
      <p className="display-clue-word">{clue.text}</p>
      <ClueBadges clue={clue} />
    </article>)}
  </div>
}

function ClueDebrief({ clues, name, width, height, identity }: Pick<BoardProps, 'name' | 'width' | 'height'> & {
  clues: DisplayClue[]; identity: string
}) {
  const wide = width >= 900
  const root = useRef<HTMLDivElement>(null)
  useClueReactions(clues, root, identity, true)
  const ordered = [...clues].sort((a, b) => b.loves - a.loves)
  const rows = ordered.flatMap(clue => nameLines(clue.authors, name, wide ? 72 : 48).map((authors, index) => ({
    id: clue.id + ':' + index, clue, authors, index,
  })))
  const pages = paginate(rows, wide ? (height >= 780 ? 9 : 6) : 5, row => 1 + Number(row.authors.length + row.clue.text.length > (wide ? 90 : 49)))
  return <div ref={root} className="space-y-3">
    {rows.length > 0 && <h3 className="font-headline text-xl font-bold">What everyone wrote</h3>}
    <DisplayPager label="Clues" pages={pages} ready auto={wide}>
      {items => <div className="display-debrief">
        {items.map(({ id, clue, authors, index }) => <article key={id} data-reaction={index === 0 ? clue.id : undefined}
          className={'display-debrief-row ' + (clue.loves > 0 ? 'display-hearted' : '')}>
          <div className="display-clue-label"><strong>{clue.text}</strong>
            {clue.duplicate && <small>Duplicate</small>}{!clue.shown && <small>Unshown</small>}
          </div>
          <span className="display-authors">{authors}</span>
          {index === 0 && <ClueBadges clue={clue} />}
        </article>)}
      </div>}
    </DisplayPager>
  </div>
}

export function FowlBoard({ round, now, name, width, height, guesser, identity }: BoardProps & {
  round: FowlDisplayRound; guesser: string; identity: string
}) {
  const reveal = fowlReveal(round.revealAt, now)
  const guessing = round.phase === 'reveal' || round.phase === 'guess'
  const handoff = round.phase === 'word-selection' && now < round.selectionOpensAt
  const writing = round.phase === 'clue-submission'
  const vote = round.phase === 'word-selection' && !handoff
  const titles = {
    'word-selection': handoff ? guesser + ', close your eyes!' : 'Choosing a word',
    'word-selected': 'The word is ready',
    'clue-submission': 'Clues are hatching',
    'clue-voting': 'Backing the best clues',
    deduplication: 'Checking for duplicates…', reveal: guesser + ' is guessing', guess: guesser + ' is guessing',
    scored: reveal.word ? (round.correct ? guesser + ' got it!' : round.clues.length ? 'The word was' : 'No clues this round') : 'Checking the result…',
  }
  return <section className="display-panel display-board space-y-5">
    <div className="display-stage-title">
      <h2 className="display-question">{titles[round.phase]}</h2>
      {round.phase !== 'scored' && <Timer deadline={handoff ? round.selectionOpensAt : round.deadline} now={now} />}
    </div>
    {guessing ? <>
      <div className="display-attempt">
        <span>Attempt {round.attempt} / {round.maxAttempts}</span>
        <span>Win +{round.payout}</span>
        {round.processing && <span role="status">Checking the guess…</span>}
      </div>
      {round.clues.length > 0 ? <LiveClues clues={round.clues} identity={identity} />
        : <div className="display-waiting"><p className="display-subtitle">All clues are locked</p><Hen art="hen-embarrassed" /></div>}
    </> : round.phase === 'scored' ? <>
      <div className={'display-outcome ' + (reveal.wordFresh ? 'animate-hen-pop' : '')}>
        <div>
          {reveal.word && <p className="display-secret">{round.word}</p>}
          {reveal.word && round.correct && <p className="text-info font-bold">Solved on attempt {round.attempt}</p>}
        </div>
        <Hen art={!reveal.word ? 'hen-thinking' : round.correct ? 'hen-winner' : round.clues.length ? 'hen-confused' : 'hen-embarrassed'}
          motion={reveal.wordFresh && round.correct ? 'celebrate' : 'still'} />
      </div>
      {reveal.landed && <ClueDebrief clues={round.clues} name={name} width={width} height={height} identity={identity} />}
    </> : <div className="display-waiting">
      <div className="space-y-4">
        {writing && <p className="display-subtitle">Write one word on your phone</p>}
        {writing && <Eggs value={round.submitted} total={round.givers} label="clues in" />}
        {vote && <Eggs value={round.voters} total={round.givers} label="voted" />}
        {round.phase === 'clue-voting' && <p className="text-on-surface-variant">Give hearts on your phone</p>}
      </div>
      <Hen art={round.phase === 'deduplication' ? 'hen-magnifying' : handoff || writing ? 'hen-blindfold' : 'hen-thinking'} />
    </div>}
  </section>
}
