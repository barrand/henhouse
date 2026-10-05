import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function nowId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

export function reportStatus(checks) {
  return checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'incomplete')
      ? 'incomplete'
      : 'pass'
}

export async function createReport({ rootDir, phase, profile, fixtureVersion, checks }) {
  const runId = `${nowId()}-${process.pid}`
  const runDir = path.join(rootDir, 'validation-runs', 'jev', runId)
  await mkdir(runDir, { recursive: true })
  const report = {
    schemaVersion: 1,
    runId,
    phase,
    profile,
    status: reportStatus(checks),
    startedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, cwd: process.cwd() },
    fixtureVersion,
    checks,
  }
  const redacted = JSON.stringify(report, null, 2)
  await writeFile(path.join(runDir, 'report.json'), redacted, 'utf8')
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
