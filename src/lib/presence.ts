import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database'
import { rtdb } from './firebase'
import { getUid } from './auth'

export function setupPresence(gameId: string) {
  const statusRef = ref(rtdb, `status/${gameId}/${getUid()}`)
  const disconnect = onDisconnect(statusRef)
  let active = true

  function report(error: unknown) {
    console.warn('Could not update room presence:', error)
  }

  const stop = onValue(ref(rtdb, '.info/connected'), snapshot => {
    if (!active || snapshot.val() !== true) return
    void disconnect.set({ connected: false, lastSeen: serverTimestamp() })
      .then(() => {
        if (active) return set(statusRef, { connected: true, lastSeen: serverTimestamp() })
      })
      .catch(report)
  })

  return () => {
    active = false
    stop()
    // Queue the offline write before canceling the server-side disconnect.
    const offline = set(statusRef, { connected: false, lastSeen: serverTimestamp() })
    void offline.catch(report)
    // Queue cancellation now so a replacement subscription can register after it,
    // including when React re-runs the effect for the same room.
    void disconnect.cancel().catch(report)
  }
}
