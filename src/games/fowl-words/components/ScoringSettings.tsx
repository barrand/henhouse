import { useEffect, useState } from 'react'
import BottomActionDock from '../../../shared/BottomActionDock'
import type { GameData } from '../types'
import { recommendedRules, revealCounts, validateRules } from '../scoring'
import type { ScoringMode, ScoringRules } from '../scoring'
import { scoringCapabilities, updateScoring } from '../service'

export default function ScoringSettings({ game, onClose }: { game: GameData; onClose: () => void }) {
  const [rules, setRules] = useState<ScoringRules>(() => structuredClone(game.pendingScoringRules ?? game.scoringRules ?? recommendedRules()))
  const [target, setTarget] = useState({ round: game.currentRound, revision: game.scoringRevision ?? 0 })
  const [available, setAvailable] = useState(false)
  const [capabilityError, setCapabilityError] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stale = target.round !== game.currentRound || target.revision !== (game.scoringRevision ?? 0)
  useEffect(() => { scoringCapabilities().then(c => setAvailable(c.bestCluesFirstEnabled)).catch(() => setCapabilityError(true)) }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [busy, onClose])
  const update = <K extends keyof ScoringRules>(key: K, value: ScoringRules[K]) => setRules(r => ({ ...r, [key]: value }))
  const save = async (cancel = false) => {
    if (stale) { setTarget({ round: game.currentRound, revision: game.scoringRevision ?? 0 }); setError('The round or settings changed. Review the target below, then save again.'); return }
    try {
      if (!cancel) validateRules(rules)
      setBusy(true); setError('')
      await updateScoring(game.id, target.round, target.revision, cancel ? undefined : rules, cancel)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings') }
    finally { setBusy(false) }
  }
  const counts = revealCounts(rules, 10, 14)
  const field = 'w-full mt-1 rounded-xl bg-surface-container-low border-2 border-outline p-3 text-on-surface'
  const secondary = 'min-h-12 rounded-xl px-4 py-2 border border-outline-variant bg-surface-container-high text-on-surface disabled:opacity-50'
  const numberField = (label: string, key: 'openingPercent' | 'minimumOpening' | 'revealAllBy' | 'hearts' | 'votingSeconds' | 'duplicatePenalty' | 'peerLovePoints' | 'mostHelpfulPoints', min: number, max: number) => <label className="block text-sm text-on-surface-variant">{label}<input type="number" min={min} max={max} value={Number.isFinite(rules[key]) ? rules[key] : ''} onChange={e => update(key, e.target.value === '' ? NaN : Number(e.target.value))} className={field} /></label>
  return <div data-action-screen className="fixed inset-0 z-50 bg-surface/95 overflow-y-auto p-4 text-on-surface" role="dialog" aria-modal="true" aria-labelledby="scoring-settings-title" onKeyDown={e => {
    if (e.key !== 'Tab') return
    const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'))
    const first = focusable[0]; const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }}>
    <div className="max-w-xl mx-auto rounded-2xl bg-surface-container-lowest border border-outline-variant p-5 space-y-5">
      <div className="flex justify-between items-center gap-3"><h2 id="scoring-settings-title" className="font-headline text-2xl font-bold">Game settings</h2><button autoFocus onClick={onClose} disabled={busy} className={secondary}>Close</button></div>
      <p className="text-sm text-on-surface-variant">Playing: {game.scoringRules?.mode === 'best-clues-first' ? 'Best Clues First' : 'Classic'}{game.pendingScoringRules && <span className="block">Next round: {game.pendingScoringRules.mode === 'classic' ? 'Classic' : 'Best Clues First'} · custom settings</span>}</p>
      <label className="block">Scoring mode<select className={field} value={rules.mode} onChange={e => setRules(recommendedRules(e.target.value as ScoringMode))}>
        <option value="classic">Classic</option><option value="best-clues-first" disabled={!available && rules.mode !== 'best-clues-first' && (game.pendingScoringRules ?? game.scoringRules)?.mode !== 'best-clues-first'}>Best Clues First · experimental</option>
      </select></label>
      <p className="text-sm text-on-surface-variant">{rules.mode === 'classic' ? 'All unique clues start visible. Speed and peer awards add points.' : 'Back great clues. The most-backed unique clues appear first. Solve early for more points.'} Changing modes loads its recommended settings.</p>
      {!available && <p className="text-sm text-on-surface-variant">{capabilityError ? 'Experimental availability could not be checked. Classic is still available.' : 'Best Clues First is available only when enabled for playtesting.'}</p>}
      <label className="block">Attempts<input type="number" min="2" max="8" className={field} value={rules.payouts.length} onChange={e => {
        const n = Number(e.target.value); if (!Number.isInteger(n) || n < 2 || n > 8) return
        setRules(r => ({ ...r, automaticAttempts: false, payouts: Array.from({ length: n }, (_, i) => r.payouts[i] ?? 1), revealAllBy: Math.min(r.revealAllBy, n) }))
      }} /></label>
      {rules.automaticAttempts && <p className="text-sm text-on-surface-variant">Classic automatically uses 3–4 attempts based on clue groups. Editing Attempts fixes the count.</p>}
      {numberField('All clues visible by attempt', 'revealAllBy', 2, rules.payouts.length)}
      <div><p className="text-sm text-on-surface-variant mb-2">Example: 10 unique + 4 duplicate groups. Actual counts follow submissions.</p><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Attempt</th><th className="p-2">Visible</th><th className="p-2">Win points</th></tr></thead><tbody>{counts.map((count, i) => <tr key={i} className="border-t border-outline-variant"><td className="p-2">{i + 1}</td><td className="p-2">{count === 14 ? 'All 14' : count}</td><td className="p-2"><input aria-label={`Attempt ${i + 1} points`} type="number" min="1" max="100" value={Number.isFinite(rules.payouts[i]) ? rules.payouts[i] : ''} onChange={e => update('payouts', rules.payouts.map((p, j) => i === j ? e.target.value === '' ? NaN : Number(e.target.value) : p))} className={`${field} max-w-24`} /></td></tr>)}</tbody></table></div>
      <button className={secondary} aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>Advanced settings</button>
      {advanced && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rules.mode === 'best-clues-first' && <>{numberField('Opening share (%)', 'openingPercent', 1, 100)}{numberField('Minimum opening clues', 'minimumOpening', 1, 50)}{numberField('Hearts per giver', 'hearts', 1, 10)}{numberField('Final voting window (seconds)', 'votingSeconds', 5, 60)}</>}
        {numberField('Duplicate penalty', 'duplicatePenalty', 0, 10)}
        {rules.mode === 'classic' && <>{numberField('Peer love points per heart', 'peerLovePoints', 0, 10)}{numberField('Most Helpful points (shared)', 'mostHelpfulPoints', 0, 20)}{[0, 1, 2].map(i => <label key={i} className="text-sm text-on-surface-variant">FAST place {i + 1}<input type="number" min="0" max="10" className={field} value={Number.isFinite(rules.fastPrizes[i]) ? rules.fastPrizes[i] : ''} onChange={e => update('fastPrizes', Array.from({ length: 3 }, (_, j) => i === j ? Number(e.target.value) : rules.fastPrizes[j] ?? 0))} /></label>)}</>}
      </div>}
      <p className="rounded-xl bg-primary-fixed text-on-primary-fixed p-3" aria-live="polite">{game.status === 'lobby' ? 'Applies to round 1' : `Applies to round ${game.currentRound + 1}`}. This round’s points stay fixed.</p>
      <BottomActionDock>
      <button onClick={onClose} disabled={busy} className={secondary}>Close settings</button>
      {error && <p className="text-error" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3"><button onClick={() => save()} disabled={busy} className="min-h-12 rounded-xl bg-action text-on-action px-5 font-bold disabled:bg-primary-container disabled:text-on-primary-container disabled:opacity-100">{busy ? 'Saving…' : game.status === 'lobby' ? 'Save settings' : 'Save for next round'}</button><button className={secondary} disabled={busy} onClick={() => setRules(recommendedRules(rules.mode))}>Reset to recommended</button>{game.pendingScoringRules && <button className={secondary} disabled={busy} onClick={() => save(true)}>Cancel pending changes</button>}</div>
      </BottomActionDock>
    </div>
  </div>
}
