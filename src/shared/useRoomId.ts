import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { watchRoomDocument } from './roomSync'

export function useRoomId(code: string | undefined, uid: string | null) {
  const roomCode = code?.toUpperCase()
  const [entry, setEntry] = useState<{ code: string; uid: string; gameId: string | null } | null>(null)
  const resolved = roomCode === entry?.code && uid === entry?.uid ? entry : null

  useEffect(() => {
    if (!roomCode || !uid || resolved) return
    return watchRoomDocument(doc(db, 'rooms', roomCode), { feed: 'lookup' }, snapshot => {
      // Room codes are reusable. Confirm the mapping before joining a game.
      if (snapshot.metadata.fromCache) return
      const room = snapshot.data()
      setEntry({ code: roomCode, uid, gameId: room?.active && typeof room.gameId === 'string' ? room.gameId : null })
    })
  }, [roomCode, uid, resolved])

  return { gameId: resolved?.gameId ?? null, lookupError: resolved && !resolved.gameId ? 'Room not found' : '' }
}
