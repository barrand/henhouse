import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import type { RoundAction } from './types'

export const createGame = httpsCallable<{ playerName: string }, { code: string; gameId: string }>(functions, 'itWasYouCreateGame')
export const roundAction = httpsCallable<RoundAction & { early?: boolean }, void>(functions, 'itWasYouRoundAction')
export const rematch = httpsCallable<{ gameId: string }, { code: string }>(functions, 'itWasYouRematch')
