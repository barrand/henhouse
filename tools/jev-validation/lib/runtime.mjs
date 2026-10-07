import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const isWindows = process.platform === 'win32'

async function exists(candidate) {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export async function resolveCommand(name) {
  const override = process.env[`JEV_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_BIN`]
  if (override) return override
  if (name === 'java') return 'java'

  const executable = isWindows ? `${name}.cmd` : name
  const candidates = []
  if (isWindows && name === 'npm') candidates.push('C:\\Program Files\\nodejs\\npm.cmd')
  if (name === 'firebase') candidates.push(path.join(process.cwd(), 'node_modules', '.bin', isWindows ? 'firebase.cmd' : 'firebase'))
  if (isWindows && name === 'firebase') candidates.push(path.join(process.env.APPDATA ?? '', 'npm', 'firebase.cmd'))
  candidates.push(executable)

  for (const candidate of candidates) {
    if (!candidate.includes(path.sep) || await exists(candidate)) return candidate
  }
  return null
}

export function run(command, args, { cwd, env = {}, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const basename = path.basename(command).toLowerCase()
    const script = basename === 'npm.cmd'
      ? path.join(path.dirname(command), 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : basename === 'firebase.cmd'
        ? path.join(path.dirname(command), path.basename(path.dirname(command)) === '.bin' ? '..' : 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')
        : null
    const child = spawn(script ? process.execPath : command, script ? [script, ...args] : args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => { stdout += chunk })
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr, error: error.message, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

export function shortOutput(result) {
  const output = `${result.stdout}\n${result.stderr}`.trim().replace(/\s+/g, ' ')
  return output.slice(0, 500)
}

export function assertLoopback(host) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`refusing non-loopback emulator host: ${host}`)
  }
}

function requestOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume()
      resolve(response.statusCode && response.statusCode < 500)
    })
    request.on('error', () => resolve(false))
    request.setTimeout(500, () => request.destroy())
  })
}

export async function probeVite(rootDir, timeoutMs = 30_000) {
  const vite = path.join(rootDir, 'node_modules', '.bin', isWindows ? 'vite.cmd' : 'vite')
  if (!await exists(vite)) return { ok: false, message: 'local Vite executable is missing' }
  const port = 5179
  const viteScript = isWindows
    ? path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
    : vite
  const child = spawn(isWindows ? process.execPath : vite, isWindows ? [viteScript, '--host', '127.0.0.1', '--port', String(port), '--strictPort'] : ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: rootDir,
    env: { ...process.env },
    shell: false,
    windowsHide: true,
  })
  let output = ''
  child.stdout?.on('data', (chunk) => { output += chunk })
  child.stderr?.on('data', (chunk) => { output += chunk })
  const startedAt = Date.now()
  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (await requestOk(`http://127.0.0.1:${port}/`)) return { ok: true, message: `Vite responded on loopback port ${port}` }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return { ok: false, message: `Vite did not become ready: ${output.replace(/\s+/g, ' ').slice(0, 500)}` }
  } finally {
    child.kill('SIGTERM')
  }
}
