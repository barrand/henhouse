// Fowl Words-specific game service functions

import { httpsCallable } from 'firebase/functions'
import { functions, db, auth } from '../../lib/firebase'
import type { ScoringRules, ScoringView } from './scoring'
import type { RoundData, GameData, PlayerData } from './types'
import { collection, doc } from 'firebase/firestore'
import { watchRoomCollection, watchRoomDocument } from '@shared/roomSync'
import { applyReactionCounts, combineReactionCounts, type ReactionCounts } from '@shared/reactionCounts'

// -- Fowl Words Callable Functions --

const fowlWordsCreateGameFn = httpsCallable<{ playerName: string; includePatrioticQuestions?: boolean; experimental?: boolean }, { gameId: string; code: string }>(functions, 'fowlWordsCreateGame')
const fowlWordsRematchFn = httpsCallable<{ gameId: string }, { code: string }>(functions, 'fowlWordsRematch')
const fowlWordsStartGameFn = httpsCallable<{ gameId: string }, void>(functions, 'fowlWordsStartGame')
const submitClueFn = httpsCallable<{ gameId: string; roundNum: number; clue: string }, void>(functions, 'submitClue')
const submitGuessFn = httpsCallable<{ gameId: string; roundNum: number; guess: string; expectedAttempt?: number }, void>(functions, 'submitGuess')
const fowlWordsAdvanceRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'fowlWordsAdvanceRound')
const fowlWordsForceDedupFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsForceDedup')
const fowlWordsUnlockFirstFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsUnlockFirst')
const fowlWordsSubmitWordVoteFn = httpsCallable<{ gameId: string; roundNum: number; wordIndex: number }, void>(functions, 'fowlWordsSubmitWordVote')
const fowlWordsFinalizeWordSelectionFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsFinalizeWordSelection')
const fowlWordsSkipWordSelectionPrivacyHandoffFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsSkipWordSelectionPrivacyHandoff')
const fowlWordsBeginClueSubmissionFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsBeginClueSubmission')
const fowlWordsSubmitCluePeerLoveFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitCluePeerLove')
const fowlWordsSubmitCluePeerBooFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitCluePeerBoo')
const fowlWordsSubmitGuesserMostHelpfulFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitGuesserMostHelpful')
const fowlWordsSubmitGuesserBooFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitGuesserBoo')

/** @deprecated legacy alias — calls fowlWordsSubmitCluePeerLove */
const fowlWordsSubmitClueStarVoteFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitClueStarVote')
/** @deprecated legacy alias — calls fowlWordsSubmitCluePeerBoo */
const fowlWordsSubmitClueThumbsDownVoteFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitClueThumbsDown')
/** @deprecated legacy alias — calls fowlWordsSubmitGuesserMostHelpful */
const fowlWordsSubmitGuesserStarVoteFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitGuesserStarVote')
/** @deprecated legacy alias — calls fowlWordsSubmitGuesserBoo */
const fowlWordsSubmitGuesserThumbsDownVoteFn = httpsCallable<{ gameId: string; roundNum: number; groupIndex: number }, void>(functions, 'fowlWordsSubmitGuesserThumbsDown')

export async function fowlWordsCreateGame(playerName: string, includePatrioticQuestions: boolean = false, experimental: boolean = false) {
  const result = await fowlWordsCreateGameFn({ playerName, includePatrioticQuestions, experimental })
  return result.data
}

export async function fowlWordsRematch(gameId: string) {
  const result = await fowlWordsRematchFn({ gameId })
  return result.data
}

export async function startGame(gameId: string) {
  await fowlWordsStartGameFn({ gameId })
}

export async function submitClue(gameId: string, roundNum: number, clue: string) {
  await submitClueFn({ gameId, roundNum, clue })
}

export async function submitGuess(gameId: string, roundNum: number, guess: string, expectedAttempt?: number) {
  await submitGuessFn({ gameId, roundNum, guess, ...(expectedAttempt === undefined ? {} : { expectedAttempt }) })
}

export async function recoverGuess(gameId: string, roundNum: number) {
  await httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsRecoverGuess')({ gameId, roundNum })
}

export async function advanceRound(gameId: string) {
  await fowlWordsAdvanceRoundFn({ gameId })
}

export async function forceDedup(gameId: string, roundNum: number) {
  await fowlWordsForceDedupFn({ gameId, roundNum })
}

export async function unlockFirst(gameId: string, roundNum: number) {
  await fowlWordsUnlockFirstFn({ gameId, roundNum })
}

export async function submitWordVote(gameId: string, roundNum: number, wordIndex: number) {
  await fowlWordsSubmitWordVoteFn({ gameId, roundNum, wordIndex })
}

export async function finalizeWordSelection(gameId: string, roundNum: number) {
  await fowlWordsFinalizeWordSelectionFn({ gameId, roundNum })
}

export async function skipWordSelectionPrivacyHandoff(gameId: string, roundNum: number) {
  await fowlWordsSkipWordSelectionPrivacyHandoffFn({ gameId, roundNum })
}

export async function beginClueSubmission(gameId: string, roundNum: number) {
  await fowlWordsBeginClueSubmissionFn({ gameId, roundNum })
}

export async function submitCluePeerLoveVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitCluePeerLoveFn({ gameId, roundNum, groupIndex })
}

export async function submitCluePeerBooVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitCluePeerBooFn({ gameId, roundNum, groupIndex })
}

export async function submitGuesserMostHelpfulVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitGuesserMostHelpfulFn({ gameId, roundNum, groupIndex })
}

export async function submitGuesserBooVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitGuesserBooFn({ gameId, roundNum, groupIndex })
}

/** @deprecated use submitCluePeerLoveVote */
export async function submitClueStarVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitClueStarVoteFn({ gameId, roundNum, groupIndex })
}

/** @deprecated use submitCluePeerBooVote */
export async function submitClueThumbsDownVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitClueThumbsDownVoteFn({ gameId, roundNum, groupIndex })
}

/** @deprecated use submitGuesserMostHelpfulVote */
export async function submitGuesserStarVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitGuesserStarVoteFn({ gameId, roundNum, groupIndex })
}

/** @deprecated use submitGuesserBooVote */
export async function submitGuesserThumbsDownVote(gameId: string, roundNum: number, groupIndex: number) {
  await fowlWordsSubmitGuesserThumbsDownVoteFn({ gameId, roundNum, groupIndex })
}

// -- Fowl Words Real-time Listeners --

import { onGameUpdate as sharedOnGameUpdate, onPlayersUpdate as sharedOnPlayersUpdate } from '@shared/gameService'

export function onGameUpdate(gameId: string, callback: (data: GameData | null) => void) {
  return sharedOnGameUpdate<GameData>(gameId, callback)
}

export function onPlayersUpdate(gameId: string, callback: (players: PlayerData[]) => void) {
  return sharedOnPlayersUpdate(gameId, (players) => {
    callback(players as unknown as PlayerData[])
  })
}

const fowlWordsAbandonGameFn = httpsCallable<{ gameId: string }, void>(functions, 'fowlWordsAbandonGame')
export async function fowlWordsAbandonGame(gameId: string) {
  await fowlWordsAbandonGameFn({ gameId })
}

export function onRoundUpdate(gameId: string, roundNum: number, callback: (data: RoundData | null) => void) {
  let stopView: ReturnType<typeof watchRoomDocument> | undefined
  let stopCounts: (() => void) | undefined
  let stopBallot: (() => void) | undefined
  let publicRound: RoundData | null = null
  let view: ScoringView | undefined
  let counts: ReactionCounts | undefined
  let ballot: { loves: string[]; boo: string | null } | undefined
  let viewRetry: ReturnType<typeof setTimeout> | undefined
  let retriedView = false
  const roundRef = doc(db, 'games', gameId, 'rounds', String(roundNum))
  const scope = { gameId, round: roundNum }
  const uid = auth.currentUser?.uid
  const needsView = () => publicRound?.scoringVersion === 1 && uid
    && (!publicRound.eligiblePlayerIds?.length || publicRound.eligiblePlayerIds.includes(uid))
  const emit = () => {
    let engine = view
    if (needsView() && (!view || view.phase !== publicRound?.status || view.attempt !== publicRound.currentAttempt)) {
      // Both documents are written together, but their listeners can deliver in either order.
      if (!retriedView && viewRetry === undefined) {
        viewRetry = setTimeout(() => {
          viewRetry = undefined
          retriedView = true
          stopView?.restart()
          callback(publicRound)
        }, 3000)
      }
      if (!retriedView) return
      engine = undefined
    } else {
      clearTimeout(viewRetry)
      viewRetry = undefined
      retriedView = false
    }
    if (engine?.reactionFeed && (engine.phase === 'reveal' || engine.phase === 'guess')) {
      engine = {
        ...engine,
        ...(counts ? { groups: applyReactionCounts(engine.groups, counts) } : {}),
        ...(ballot ? { ownLove: ballot.loves, ownBoo: ballot.boo } : {}),
      }
    }
    callback(publicRound ? { ...publicRound, ...(engine ? { engine } : {}) } : null)
  }
  const stop = watchRoomDocument<RoundData>(roundRef, { ...scope, feed: 'round' }, snap => {
    publicRound = snap.exists() ? { id: snap.id, ...snap.data() } as RoundData : null
    if (uid && needsView() && !stopView) {
      stopView = watchRoomDocument<{ engine?: ScoringView }>(doc(roundRef, 'views', uid), { ...scope, feed: 'player-view' }, own => {
        view = own.data()?.engine as ScoringView | undefined
        if (view?.reactionFeed && (view.phase === 'reveal' || view.phase === 'guess') && !stopCounts) {
          stopCounts = watchRoomCollection(collection(roundRef, 'reactionCounts'), { ...scope, feed: 'reactions' }, shards => {
            counts = combineReactionCounts(shards.docs.map(shard => shard.data()))
            emit()
          })
          stopBallot = watchRoomDocument(doc(roundRef, 'privateReactions', uid), { ...scope, feed: 'ballot' }, ownBallot => {
            ballot = ownBallot.data() as typeof ballot
            emit()
          })
        } else if (view?.phase === 'scored') {
          stopCounts?.()
          stopBallot?.()
          stopCounts = undefined
          stopBallot = undefined
        }
        emit()
      }, data => ({ phase: data.engine?.phase, attempt: data.engine?.attempt }))
    }
    emit()
  }, round => ({ phase: round.status, attempt: round.currentAttempt, revision: round.revision }))
  return () => {
    clearTimeout(viewRetry)
    stop()
    stopView?.()
    stopCounts?.()
    stopBallot?.()
  }
}

export async function scoringCapabilities() {
  return (await httpsCallable<void, { bestCluesFirstEnabled: boolean }>(functions, 'fowlWordsScoringCapabilities')()).data
}

export async function updateScoring(gameId: string, expectedRound: number, expectedRevision: number, rules?: ScoringRules, cancel = false) {
  await httpsCallable(functions, 'fowlWordsUpdateScoring')({ gameId, expectedRound, expectedRevision, ...(rules ? { rules } : {}), cancel })
}

export async function scoringAction(gameId: string, roundNum: number, action: string, payload: { expectedAttempt?: number; text?: string; clueId?: string; index?: number } = {}) {
  await httpsCallable(functions, 'fowlWordsScoringAction')({ gameId, roundNum, action, ...payload })
}
