import { HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

export type AiExperimentMode = 'legacy' | 'shadow' | 'jev'
export interface AiExperiment { mode: AiExperimentMode; model: string; configVersion: string; enabledAt: admin.firestore.Timestamp }
export const JEV_CONFIG_VERSION = 'jev-v1'
const JEV_MODEL = 'jev-1.13.0'

function legacyExperiment(): AiExperiment {
  return { mode: 'legacy', model: JEV_MODEL, configVersion: JEV_CONFIG_VERSION, enabledAt: admin.firestore.Timestamp.now() }
}

async function admitted(uid: string): Promise<AiExperimentMode | null> {
  const data = (await admin.firestore().doc('aiExperimentConfig/jev').get()).data()
  if (!data?.admissionEnabled || data.approvedConfigVersion !== JEV_CONFIG_VERSION) return null
  const allowed = Array.isArray(data.allowedHostUids) ? data.allowedHostUids : []
  if (allowed.length && !allowed.includes(uid)) return null
  return data.mode === 'shadow' || data.mode === 'jev' ? data.mode : null
}

export async function experimentForCreation(uid: string, requested: boolean): Promise<AiExperiment> {
  if (!requested) return legacyExperiment()
  const mode = await admitted(uid)
  if (!mode) throw new HttpsError('failed-precondition', 'Experimental Jev Mode is not available for this host')
  return { ...legacyExperiment(), mode }
}

export async function requireExperimentRematch(uid: string, existing: unknown): Promise<AiExperiment> {
  const experiment = existing as Partial<AiExperiment> | undefined
  if (!experiment || experiment.mode === 'legacy') return legacyExperiment()
  if (!await admitted(uid)) throw new HttpsError('failed-precondition', 'Experimental Jev Mode is no longer available for this rematch')
  return experiment as AiExperiment
}

export async function sanitizedExperimentCapabilities(uid: string) {
  return { experimentalAvailable: !!(await admitted(uid)), provider: 'jev' as const, configVersion: JEV_CONFIG_VERSION }
}
