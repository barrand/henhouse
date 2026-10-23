import { useEffect, useRef, useState } from 'react'
import type { GameData, PlayerData } from '../types'
import type { ScoringView } from '../scoring'
import { advanceRound, scoringAction } from '../service'

const primary = 'min-h-12 rounded-xl px-5 py-3 bg-primary text-on-primary font-headline font-bold disabled:bg-primary-container disabled:text-on-primary-container disabled:opacity-100 active:scale-[0.98] transition-all'
const secondary = 'min-h-12 rounded-xl px-4 py-3 bg-surface-container-high border border-outline-variant/60 text-on-surface disabled:opacity-50'
const field = 'w-full rounded-xl px-4 py-3 border-2 border-outline bg-surface-container-low text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none'

export default function ScoringRound({ game, view: v, players, uid, isHost }: {
  game: GameData; view: ScoringView; players: PlayerData[]; uid: string; isHost: boolean
}) {
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [confirmGiveUp, setConfirmGiveUp] = useState(false)
  const [peek, setPeek] = useState(false)
  const lastTick = useRef(0)
  const [tickError, setTickError] = useState('')
  const countdown = Math.max(0, Math.ceil((v.deadline - now) / 1000))
  const name = (id: string) => players.find(p => p.id === id)?.name ?? 'Player'
  const mode = v.rules.mode === 'classic' ? 'Classic' : 'Best Clues First'
  const enteringClues = v.phase === 'clue-submission'
  const selectedWordIndex = v.phase === 'word-selected' && v.secretWord
    ? v.wordOptions.findIndex(word => word.toLowerCase() === v.secretWord.toLowerCase())
    : -1
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer) }, [])
  useEffect(() => { setText(''); setConfirmGiveUp(false); setPeek(false); setError(''); window.scrollTo(0, 0) }, [v.attempt, v.roundNum, enteringClues])
  useEffect(() => {
    if (!v.participating || !isHost || v.phase === 'scored') return
    const expired = v.processing ? now >= v.claimExpiresAt
      : v.phase === 'deduplication' ? now >= v.phaseClaimExpiresAt : now >= v.deadline
    if (!expired || now - lastTick.current < 2500) return
    lastTick.current = now
    scoringAction(game.id, v.roundNum, 'tick').then(() => setTickError('')).catch(() => setTickError('Reconnecting to the round…'))
  }, [now, v, game.id])
  const act = async (action: string, payload: { text?: string; clueId?: string; index?: number } = {}) => {
    setBusy(true); setError('')
    try { await scoringAction(game.id, v.roundNum, action, { expectedAttempt: v.attempt, ...payload }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete that action') }
    finally { setBusy(false) }
  }
  const advance = async () => {
    setBusy(true); setError('')
    try { await advanceRound(game.id) } catch (e) { setError(e instanceof Error ? e.message : 'Could not advance') }
    finally { setBusy(false) }
  }
  const status = <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-on-surface-variant mb-4"><span>{mode} · {v.phase === 'scored' ? 'Round complete' : 'Rules fixed for this round'}</span>{v.deadline > 0 && <span role="timer" aria-label={`${countdown} seconds remaining`}>{countdown}s</span>}</div>
  const art = (file: string) => <img src={`/images/generated-comic/${file}.png`} alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
  const secret = v.secretWord && <button type="button" className="w-full rounded-2xl bg-primary-fixed text-on-primary-fixed p-4 mb-4 touch-none select-none" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPeek(true) }} onPointerUp={() => setPeek(false)} onPointerCancel={() => setPeek(false)} onLostPointerCapture={() => setPeek(false)} onBlur={() => setPeek(false)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPeek(true) } }} onKeyUp={() => setPeek(false)} aria-pressed={peek}>{peek ? <span className="font-headline text-3xl font-bold break-words">{v.secretWord}</span> : 'Hold to see the secret word'}</button>
  const groupCards = (results = false) => <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{v.groups.map(g => <div key={g.id} className={`min-w-0 rounded-2xl border p-3 space-y-2 ${g.newlyShown && !results ? 'border-primary bg-primary-container text-on-primary-container animate-hen-pop' : 'border-outline-variant/60 bg-surface-container-lowest'}`}>
    <p className="font-headline font-bold text-lg break-words [overflow-wrap:anywhere]">{g.text}</p>
    <p className="text-xs">{g.mine ? 'Your clue · ' : ''}{g.shown ? 'Shown' : 'Unshown'}{g.duplicate ? ' · Duplicate' : ''}</p>
    {results && <p className="text-sm text-on-surface-variant break-words">{g.authors.map(name).join(', ')}</p>}
    <div className="flex flex-wrap gap-2 text-sm">{(v.rules.mode === 'classic' || results) && <span>❤️ {g.loves}{results && v.rules.mode === 'best-clues-first' ? ' backing' : ''}</span>}<span>👎 {g.boos}</span>{g.helpful && <span>⭐ Most Helpful</span>}</div>
    {!results && !v.guesser && g.shown && !g.mine && <div className="flex flex-wrap gap-2">
      {v.rules.mode === 'classic' && <button type="button" disabled={busy || countdown === 0} onClick={() => act('love', { clueId: g.id })} aria-pressed={v.ownLove.includes(g.id)} className={`${secondary} text-sm`}>❤️ {v.ownLove.includes(g.id) ? 'Loved' : 'Peer love'}</button>}
      <button type="button" disabled={busy || countdown === 0} onClick={() => act('boo', { clueId: g.id })} aria-pressed={v.ownBoo === g.id} className={`${secondary} text-sm`}>👎 Boo</button>
    </div>}
    {results && v.guesser && g.shown && <div className="flex flex-wrap gap-2">{v.correct && <button type="button" className={`${secondary} text-sm`} disabled={busy} aria-pressed={g.helpful} onClick={() => act('helpful', { clueId: g.id })}>⭐ Most Helpful{v.rules.mostHelpfulPoints ? ` +${Math.max(1, Math.floor(v.rules.mostHelpfulPoints / g.authors.length))}` : ''}</button>}<button type="button" className={`${secondary} text-sm`} disabled={busy} aria-pressed={v.ownBoo === g.id} onClick={() => act('boo', { clueId: g.id })}>👎 Boo</button></div>}
  </div>)}</div>
  const resultCards = <div className="grid grid-cols-2 gap-2">{v.groups.map(g => <div key={g.id} className={`relative flex flex-col min-w-0 rounded-xl border-2 shadow-sm px-2.5 py-2 ${g.duplicate ? 'border-error/40 bg-surface-container' : g.shown && v.correct ? 'border-primary/60 bg-surface-container-lowest' : 'border-outline-variant/60 bg-surface-container-lowest'}`}>
    <p className={`font-headline font-bold text-xl leading-tight text-center line-clamp-2 min-h-11 flex items-center justify-center ${g.duplicate ? 'text-error line-through' : 'text-on-surface'}`}>{g.text}</p>
    <p className="text-xs text-on-surface-variant font-medium text-center leading-snug min-h-4 truncate">{g.authors.map(name).join(', ') || '—'}{g.duplicate && <span className="text-error font-bold uppercase text-[9px] tracking-wide"> · dup</span>}</p>
    <div className="flex items-center justify-center gap-2 min-h-8 mt-1 text-sm"><span>❤️ {g.loves}</span><span>👎 {g.boos}</span>{g.helpful && <span>⭐</span>}</div>
    <div className="flex gap-1.5 mt-1">
      {v.guesser && v.correct && g.shown && <button type="button" className={`${secondary} flex-1 text-xs px-2`} disabled={busy} aria-pressed={g.helpful} onClick={() => act('helpful', { clueId: g.id })}>⭐ {g.helpful ? 'Helpful' : 'Most helpful'}</button>}
      {((v.guesser && g.shown) || (!v.guesser && g.shown && !g.mine)) && <button type="button" className={`${secondary} flex-1 text-xs px-2`} disabled={busy} aria-pressed={v.ownBoo === g.id} onClick={() => act('boo', { clueId: g.id })}>👎 Boo</button>}
    </div>
  </div>)}</div>

  if (!v.participating) return <main className="p-6 text-center">You’ll join the next round.</main>
  return <main className="w-full max-w-5xl mx-auto px-4 py-6 space-y-4">
    {status}
    {error && <p role="alert" className="text-error">{error}</p>}
    {tickError && <p role="status" className="text-on-surface-variant">{tickError}</p>}
    {(v.phase === 'word-selection' || v.phase === 'word-selected') && <div className="max-w-md mx-auto space-y-5 text-center">
      <div className="space-y-2">
        <img src={`/images/generated-comic/${v.phase === 'word-selected' ? 'hen-excited' : 'hen-thinking'}.png`} alt="" className={`w-24 h-24 mx-auto ${v.phase === 'word-selected' ? 'animate-hen-pop' : 'animate-hen-bob'}`} />
        <h2 className="font-headline text-3xl font-bold">{v.phase === 'word-selected'
          ? v.guesser ? 'Your word is ready!' : <>The flock picked <span className="text-primary">this one!</span></>
          : v.guesser ? 'No peeking!' : now < v.selectionOpensAt ? 'Guesser, look away!' : <>Pick a word for <span className="text-primary">the guesser</span>!</>}</h2>
        <p className="text-on-surface-variant">{v.phase === 'word-selected'
          ? v.guesser ? 'The others are getting ready to write clues. Still no peeking.' : 'Get ready to write a clue for the spotlight word.'
          : v.guesser ? 'The flock is choosing your word.' : now < v.selectionOpensAt ? 'Keep the guesser’s screen private. Voting starts in a moment.' : 'Choose the one that will make for the most fun round.'}</p>
      </div>

      <div className={`flex items-center justify-center gap-3 ${v.phase === 'word-selected' ? 'animate-hen-pop' : ''}`}>
        <div className={`font-headline text-4xl font-bold tabular-nums ${v.phase === 'word-selected' ? 'text-primary' : countdown <= 5 ? 'text-error' : countdown <= 10 ? 'text-tertiary' : 'text-primary'}`}>{countdown}</div>
        <div className="text-on-surface-variant text-sm">{v.phase === 'word-selected' ? 'starting clues' : `${v.wordsVoted}/${v.giverCount} voted`}</div>
      </div>

      {!v.guesser && v.wordOptions.length > 0 && <div className="grid grid-cols-3 gap-3">
        {v.wordOptions.map((word, index) => {
          const isMyPick = v.myWordVote === index
          const isSelected = v.phase === 'word-selected' && selectedWordIndex === index
          const isDimmed = v.phase === 'word-selected' && !isSelected
          return <button key={index} disabled={busy || countdown === 0 || v.phase === 'word-selected'} onClick={() => act('word-vote', { index })} aria-pressed={isMyPick} className={`relative flex min-h-32 flex-col items-center justify-center overflow-visible rounded-2xl border-2 px-3 py-5 font-body transition-all ${isSelected ? 'bg-primary-fixed border-primary text-on-primary-fixed scale-[1.08] animate-word-selected-card shadow-xl' : isDimmed ? 'bg-surface-container-lowest border-outline-variant/50 text-outline opacity-45 scale-95' : isMyPick ? 'bg-primary border-primary text-on-primary shadow-[0_8px_24px_rgba(0,0,0,0.3)] scale-[1.04] active:scale-[0.97]' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface hover:border-primary/50 hover:bg-primary-fixed/20 active:scale-[0.97]'}`}>
            {isSelected && <span className="pointer-events-none absolute inset-0 z-0"><span className="absolute left-2 top-2 text-primary animate-word-spark">✦</span><span className="absolute right-3 top-4 text-tertiary animate-word-spark-delayed">✶</span><span className="absolute bottom-3 left-1/2 text-secondary animate-word-spark-late">✦</span></span>}
            <span className="relative z-10 font-headline text-base font-bold text-center leading-tight">{word}</span>
            {isMyPick && v.phase === 'word-selection' && <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-label">Yours</span>}
          </button>
        })}
      </div>}

      {v.phase === 'word-selected' && !v.guesser && secret}
      {v.guesser && <div className="flex justify-center gap-2"><span className="w-2 h-2 bg-primary rounded-full animate-bounce" /><span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]" /><span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]" /></div>}
      {v.phase === 'word-selection' && !v.guesser && <p className="text-center text-outline text-xs">{v.wordsVoted < v.giverCount ? `Waiting for ${v.giverCount - v.wordsVoted} more vote${v.giverCount - v.wordsVoted !== 1 ? 's' : ''}…` : 'All voted! Finalizing…'}</p>}
    </div>}
    {(v.phase === 'clue-submission' || v.phase === 'clue-voting') && <>
      {v.guesser ? <div className="max-w-md mx-auto space-y-4 text-center">{art('hen-blindfold')}<h2 className="font-headline text-3xl font-bold">{v.phase === 'clue-voting' ? 'Best clues coming up' : 'No peeking!'}</h2><p className="text-on-surface-variant">{v.phase === 'clue-voting' ? 'The flock is backing the clues that will help you.' : 'The flock is writing one-word clues.'}</p><p>{v.submittedCount} of {v.giverCount} clues submitted</p></div> : <>
        <div className="max-w-md mx-auto">{secret}{v.ownClue ? <p className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 mb-4">Your locked clue: <strong className="break-words">{v.ownClue}</strong></p> : v.phase === 'clue-submission' ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); act('clue', { text: text.trim() }) }}><label htmlFor="scoring-clue" className="block">Your one-word clue</label><input id="scoring-clue" className={field} value={text} maxLength={50} autoComplete="off" onChange={e => setText(e.target.value)} /><button type="submit" className={`${primary} w-full`} disabled={busy || countdown === 0 || !/^[\p{L}\p{M}]+$/u.test(text.trim())}>{busy ? 'Submitting…' : v.rules.mode === 'classic' ? 'Lock clue' : 'Lock clue & back others'}</button></form> : <p className="text-on-surface-variant">Clue submission closed. You can watch this round and join the next.</p>}</div>
        {v.ownClue && v.rules.mode === 'best-clues-first' && <>
          <div className="sticky top-20 z-10 bg-surface py-3 border-b border-outline-variant/60 flex flex-wrap items-center justify-between gap-2"><h2 className="font-headline text-xl font-bold">Back the best clues</h2><span aria-live="polite">{v.rules.hearts - v.ownRankingVotes.length} hearts left · {v.phase === 'clue-voting' ? `Final voting: ${countdown}s` : `${v.submittedCount}/${v.giverCount} submitted`}</span></div>
          <p className="text-on-surface-variant">Back clues that help the guesser solve early. {v.ownRankingVotes.length >= v.rules.hearts ? 'Unback a clue to move a heart.' : 'You can change your choices until voting closes.'}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{v.board.map(c => <button key={c.id} type="button" aria-label={`Back ${c.text}`} aria-pressed={c.backed} disabled={busy || countdown === 0 || (!c.backed && v.ownRankingVotes.length >= v.rules.hearts)} onClick={() => act('rank', { clueId: c.id })} className={`min-w-0 min-h-24 p-4 rounded-2xl border text-left ${c.backed ? 'bg-primary-container text-on-primary-container border-primary' : 'bg-surface-container-lowest border-outline-variant/60'}`}><span className="block font-headline text-xl font-bold break-words [overflow-wrap:anywhere]">{c.text}</span><span className="block mt-3 text-sm">{c.backed ? '❤️ Backed' : '♡ Back clue'}</span></button>)}</div>
          {!v.board.length && <p className="text-on-surface-variant">Other clues will appear here as they arrive.</p>}
        </>}
        {v.ownClue && v.rules.mode === 'classic' && <p className="text-center text-on-surface-variant">{v.submittedCount} of {v.giverCount} clues submitted. Waiting for the flock.</p>}
      </>}
      {isHost && v.phase === 'clue-submission' && <button type="button" className={secondary} disabled={busy} onClick={() => act('tick')}>Finish submissions now</button>}
    </>}
    {v.phase === 'deduplication' && <div className="text-center space-y-4">{art('hen-magnifying')}<h2 className="font-headline text-2xl font-bold">Checking clues</h2><p className="text-on-surface-variant">Finding duplicates and preparing the reveal.</p></div>}
    {(v.phase === 'reveal' || v.phase === 'guess') && <>
      <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="font-headline text-2xl font-bold">{v.guesser ? 'What’s the word?' : `${name(game.currentGuesser ?? '')} is guessing`}</h2><span className="rounded-xl bg-primary-fixed text-on-primary-fixed p-3">Attempt {v.attempt}/{v.maxAttempts} · Win +{v.payout}</span></div>
      {!v.guesser && <div className="max-w-md mx-auto">{secret}<p className="mb-3 text-on-surface-variant">{v.rules.mode === 'classic' ? 'Love shown clues (+points on a win) and Boo one clue.' : 'Shown clue authors earn the same win tier as the guesser. Boo is just for fun.'}</p></div>}
      {v.guesser && <form className="max-w-md mx-auto space-y-3 pt-4" onSubmit={e => { e.preventDefault(); act('guess', { text: text.trim() }) }}>
        <label htmlFor="scoring-guess" className="block">Your guess</label><input id="scoring-guess" className={field} placeholder="Type the secret word" value={text} maxLength={100} autoComplete="off" onChange={e => setText(e.target.value)} disabled={v.processing || busy || countdown === 0} />
        <button className={`${primary} w-full`} type="submit" disabled={busy || v.processing || countdown === 0 || !text.trim()}>{v.processing ? 'Checking your guess…' : 'Guess'}</button>
        {v.hiddenCount > 0 && v.attempt < v.maxAttempts ? <button type="button" className={`${secondary} w-full`} disabled={busy || v.processing || countdown === 0} onClick={() => act('skip')}>Skip · reveal {v.nextRevealCount} more · next win +{v.nextPayout}</button> : confirmGiveUp ? <div className="rounded-xl border border-outline-variant/60 p-4 space-y-3"><p>End this round without win points?</p><div className="flex flex-wrap gap-3"><button type="button" className={secondary} onClick={() => setConfirmGiveUp(false)}>Keep guessing</button><button type="button" className="min-h-12 px-4 rounded-xl bg-error text-on-error" disabled={busy || v.processing} onClick={() => act('give-up')}>Give up</button></div></div> : <button type="button" className={`${secondary} w-full`} disabled={busy || v.processing || countdown === 0} onClick={() => setConfirmGiveUp(true)}>Give up</button>}
      </form>}
      {v.guesser && v.groups.length > 0 && <h3 className="font-headline text-xl font-bold">{v.groups.length} clues revealed</h3>}
      {v.groups.length ? groupCards() : <div className="text-center p-6 space-y-3">{art('hen-embarrassed')}<h3 className="font-headline text-2xl">All clues are duplicates</h3><p>Skip to unlock the first batch.</p></div>}
      {!v.guesser && <p className="text-sm text-on-surface-variant">Your points if solved now: {v.tentative[uid] ?? 0}{v.rules.mode === 'classic' && v.rules.mostHelpfulPoints > 0 ? ' · Most Helpful can add a bonus after a win.' : ''}</p>}
    </>}
    {v.phase === 'scored' && <>
      <div className="text-center space-y-2">{art(v.correct ? (v.attempt === 1 ? 'hen-excited' : 'hen-winner') : v.groups.length === 0 ? 'hen-embarrassed' : 'hen-confused')}<h2 className={`font-headline text-4xl font-bold tracking-tight ${v.correct ? 'text-primary' : 'text-error'}`}>{v.correct ? 'NAILED IT!' : v.groups.length === 0 ? 'NO CLUES' : 'NO LUCK'}</h2><p className="text-on-surface-variant text-sm">{v.correct ? `${name(game.currentGuesser ?? '')} got` : v.groups.length === 0 ? 'Nobody submitted a clue in time.' : `${name(game.currentGuesser ?? '')} ran out of guesses.`} {v.correct && <span className="font-headline text-2xl font-bold text-primary">{v.secretWord}</span>}</p>{!v.correct && v.secretWord && <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-primary-fixed-variant font-bold bg-primary-fixed rounded-2xl px-4 py-3 mt-2"><span className="block">The word was</span><span className="block font-headline text-3xl text-on-primary-fixed tracking-tight mt-1">{v.secretWord}</span></p>}{v.history.length > 0 && <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">{v.history.filter(h => h.text).map((h, i) => <span key={i} className="text-sm text-on-surface-variant"><span className="text-outline text-[10px]">{i + 1}.</span> <span className="font-bold text-on-surface">{h.text}</span></span>)}</div>}</div>
      {v.groups.length > 0 && <><h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">What everyone wrote</h3>{resultCards}</>}
      <section><h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">Standings</h3><ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 divide-y divide-outline-variant/50 overflow-hidden">{[...players].sort((a, b) => b.score - a.score).map((p, i) => <li key={p.id} className={`px-3 py-2 flex items-center gap-2 ${p.id === uid ? 'bg-secondary-fixed/20' : ''}`}><span className="text-outline w-5 text-sm">{i + 1}.</span><span className="flex-1 font-medium truncate">{p.name}{p.id === uid && ' ← you'}</span><span className={`text-xs font-bold ${v.scores[p.id] > 0 ? 'text-primary' : v.scores[p.id] < 0 ? 'text-error' : 'text-outline'}`}>{v.scores[p.id] ? `${v.scores[p.id] > 0 ? '+' : ''}${v.scores[p.id]}` : ''}</span><span className="font-headline text-lg font-bold tabular-nums w-8 text-right">{p.score}</span></li>)}</ul></section>
      {isHost ? <button type="button" onClick={advance} className={`${primary} w-full`} disabled={busy}>{game.currentRound >= game.settings.totalRounds ? 'See final scores →' : 'Next round →'}</button> : <p className="text-center text-on-surface-variant">Waiting for the host to continue.</p>}
    </>}
  </main>
}
