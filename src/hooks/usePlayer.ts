import { useState, useEffect } from 'react'
import { initAuth } from '../lib/auth'

export function useAuth() {
  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initAuth()
      .then((user) => {
        setUid(user.uid)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Auth failed:', err)
        setLoading(false)
      })
  }, [])

  return { uid, loading }
}

// Generic over PlayerData shape — works for Flock (with `eggs`) and Just One (with `score`)
export function useCurrentPlayer<P extends { id: string }>(players: P[], uid: string | null): P | null {
  if (!uid) return null
  return players.find((p) => p.id === uid) ?? null
}

export function useIsHost(hostId: string | null | undefined, uid: string | null): boolean {
  return !!hostId && !!uid && hostId === uid
}
