import { useEffect, useRef, type RefObject } from 'react'
import { pulseCardLove, pulseCardMostHelpful, shakeCardBoo, spawnBooFloat, spawnHeartFloat, spawnStarFloat, stampMostHelpful } from './reactionFx'

interface Counts {
  id: string
  loves: number
  boos: number
  helpful?: boolean
}

type Reaction = 'love' | 'boo' | 'helpful'

export function useClueReactions(groups: Counts[], root: RefObject<HTMLElement | null>, identity: string, shared = false) {
  const previous = useRef<{ identity: string; counts: Map<string, Counts> } | null>(null)
  const pending = useRef(new Map<string, number>())
  const played = useRef(new Map<string, number>())

  useEffect(() => {
    const before = previous.current
    previous.current = { identity, counts: new Map(groups.map(group => [group.id, group])) }
    if (!before || before.identity !== identity) {
      pending.current.clear()
      played.current.clear()
      return
    }
    if (document.visibilityState === 'hidden') return
    const cards = root.current?.querySelectorAll<HTMLElement>('[data-reaction]')
    if (!cards?.length) return
    const now = Date.now()
    for (const card of cards) {
      const id = card.dataset.reaction
      const group = id === undefined ? undefined : previous.current.counts.get(id)
      const old = id === undefined ? undefined : before.counts.get(id)
      if (!group || !old) continue
      const changed: Reaction[] = []
      if (group.loves > old.loves) changed.push('love')
      if (group.boos > old.boos) changed.push('boo')
      if (group.helpful && !old.helpful) changed.push('helpful')
      for (const reaction of changed) {
        const key = reaction + ':' + id
        const local = pending.current.get(key) ?? 0
        pending.current.delete(key)
        if (local > now || now - (played.current.get(key) ?? 0) < 300) continue
        played.current.set(key, now)
        animate(card, reaction, shared)
      }
    }
  }, [groups, root, identity, shared])

  function markLocal(id: string, reaction: Reaction) {
    pending.current.set(reaction + ':' + id, Date.now() + 3000)
  }

  return { markLocal }
}

export function animateClueReaction(card: HTMLElement, reaction: Reaction) {
  animate(card, reaction, false)
}

function animate(card: HTMLElement, reaction: Reaction, shared: boolean) {
  if (reaction === 'love') {
    spawnHeartFloat(card, shared ? 1.55 : 1)
    pulseCardLove(card)
  } else if (reaction === 'boo') {
    spawnBooFloat(card, shared ? 1.55 : 1)
    shakeCardBoo(card)
  } else {
    const badge = card.querySelector<HTMLElement>('[data-helpful]')
    if (badge) stampMostHelpful(badge)
    else spawnStarFloat(card)
    pulseCardMostHelpful(card)
  }
}
