import { createHash } from 'node:crypto'
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function nowId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

export async function evidenceFingerprint(rootDir) {
  const files = []
  async function collect(directory) {
    for (const item of await readdir(path.join(rootDir, directory), { withFileTypes: true })) {
      const name = path.join(directory, item.name)
      if (item.isDirectory()) await collect(name)
      else files.push(name)
    }
  }
  for (const directory of ['src', 'functions/src', 'tools/jev-validation']) await collect(directory)
  files.push('package-lock.json', 'functions/package-lock.json', 'firebase.json', 'firestore.rules')
  const hashes = {}
  for (const file of files.sort()) hashes[file.replaceAll('\\', '/')] = sha256(await readFile(path.join(rootDir, file)))
  let commit = 'unavailable'
  try { commit = execFileSync('git', ['-c', `safe.directory=${rootDir.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8', windowsHide: true }).trim() } catch { /* Fingerprint still covers uncommitted content. */ }
  return { commit, implementationHash: sha256(JSON.stringify(hashes)), files: hashes }
}

export function reportStatus(checks) {
  return checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'incomplete')
      ? 'incomplete'
      : 'pass'
}

export async function createReport({ rootDir, phase, profile, fixtureVersion, checks, events = [] }) {
  const runId = `${nowId()}-${process.pid}`
  const runDir = path.join(rootDir, 'validation-runs', 'jev', runId)
  await mkdir(runDir, { recursive: true })
  const report = {
    schemaVersion: 1,
    runId,
    phase,
    profile,
    status: reportStatus(checks),
    startedAt: events[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    evidence: await evidenceFingerprint(rootDir),
    runtime: { node: process.version, platform: process.platform, cwd: process.cwd() },
    fixtureVersion,
    checks,
  }
  const redacted = JSON.stringify(report, null, 2)
  await writeFile(path.join(runDir, 'report.json'), redacted, 'utf8')
  await writeFile(path.join(runDir, 'events.jsonl'), events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''), 'utf8')
  const summary = [
    `# Jev validation: ${phase}`,
    '',
    `- Status: ${report.status}`,
    `- Profile: ${profile}`,
    `- Run: ${runId}`,
    `- Fixture version: ${fixtureVersion}`,
    '',
    ...checks.map((check) => `- ${check.status.toUpperCase()}: ${check.id} — ${check.message}`),
    '',
    `Report: ${path.join(runDir, 'report.json')}`,
  ].join('\n')
  await writeFile(path.join(runDir, 'summary.md'), summary, 'utf8')
  return { ...report, reportPath: path.join(runDir, 'report.json'), summaryPath: path.join(runDir, 'summary.md') }
}
