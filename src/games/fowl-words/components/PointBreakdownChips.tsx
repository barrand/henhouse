import { ScoreChip } from './clueVoteUi'
import { type PointChip } from './pointBreakdown'

function PointChipBadge({ chip }: { chip: PointChip }) {
  switch (chip.kind) {
    case 'guess':
      return <ScoreChip icon="🎯">+{chip.pts}</ScoreChip>
    case 'used':
      return <ScoreChip>+{chip.pts}</ScoreChip>
    case 'fast':
      return <ScoreChip icon="⚡">+{chip.pts}</ScoreChip>
    case 'love':
      return <ScoreChip icon="❤️">+{chip.pts}</ScoreChip>
    case 'helpful':
      return <ScoreChip icon="⭐">+{chip.pts}</ScoreChip>
    case 'dup':
      return (
        <ScoreChip>
          <span className="text-error">{chip.pts} dup</span>
        </ScoreChip>
      )
  }
}

export function PointBreakdownChips({ chips, className = '' }: { chips: PointChip[]; className?: string }) {
  if (chips.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map((chip) => (
        <PointChipBadge key={chip.kind} chip={chip} />
      ))}
    </div>
  )
}
