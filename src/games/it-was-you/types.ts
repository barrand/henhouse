import type { BaseGameData, PlayerData } from '@shared/types'

export type { Action, DisplayRound, PlayerView, Round, RoundAction, VoteCounts } from '../../../functions/src/games/it-was-you/model'

export interface GameData extends BaseGameData {
  gameType: 'it-was-you'
}

export interface Player extends PlayerData {
  score: number
}
