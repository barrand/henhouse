#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, onSnapshot, collection } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { getDatabase, connectDatabaseEmulator, ref, set, serverTimestamp } from 'firebase/database'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

const DEFAULT_HOST = '127.0.0.1'
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

const botNames = [
  'Henrietta',
  'Cluck Norris',
  'Mabel',
  'Beakatrice',
  'Eggatha',
  'Penny',
  'Nugget',
  'Dot',
  'Myrtle',
  'Goldie',
  'Pip',
  'Winnie',
  'Hazel',
  'Juniper',
  'Maisie',
  'Opal',
]

function usage() {
  console.log('Usage: npm run bots -- --code ABCD --count 5')
  console.log('')
  console.log('Options:')
  console.log('  --code <room>       Required room code to join')
  console.log('  --count <n>         Number of bots to join (default 5)')
  console.log('  --host <host>       Emulator host (default 127.0.0.1)')
  console.log('  --model <model>     Gemini model (default GEMINI_MODEL or gemini-2.0-flash)')
}

function parseArgs(argv) {
  const args = { count: 5, host: process.env.VITE_EMULATOR_HOST || DEFAULT_HOST, model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    i += 1
    if (key === 'count') args[key] = Number(value)
    else if (key === 'rounds') throw new Error('--rounds has been removed; stop the swarm with Ctrl+C or by ending the game')
    else args[key] = value
  }
  if (!args.code) throw new Error('Missing required --code')
  if (!Number.isInteger(args.count) || args.count < 1) throw new Error('--count must be a positive integer')
  args.code = String(args.code).toUpperCase()
  return args
}

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return
  const contents = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (override || process.env[key] === undefined) process.env[key] = value
  }
}

function firebaseConfigFromEnv() {
  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  }
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) throw new Error(`Missing Firebase env values: ${missing.join(', ')}`)
  return config
}

function makeRunDir() {
  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  const dir = path.join(rootDir, 'bot-runs', stamp)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

class Reporter {
  constructor(runDir) {
    this.runDir = runDir
    this.eventsPath = path.join(runDir, 'events.jsonl')
    this.snapshotsPath = path.join(runDir, 'snapshots.json')
    this.snapshots = []
    this.errors = []
    this.actions = 0
    this.phaseChanges = []
    this.geminiCalls = 0
    this.inputTokens = 0
    this.outputTokens = 0
    fs.writeFileSync(this.eventsPath, '')
  }

  event(type, data = {}) {
    const entry = { ts: new Date().toISOString(), type, ...data }
    fs.appendFileSync(this.eventsPath, `${JSON.stringify(entry)}\n`)
    if (type === 'error') this.errors.push(entry)
    if (type === 'bot-action') this.actions += 1
    if (type === 'phase-change') this.phaseChanges.push(entry)
    const message = this.formatConsole(entry)
    if (message) console.log(message)
  }

  formatConsole(entry) {
    if (entry.type === 'join') return `[join] ${entry.botName} joined as ${entry.uid.slice(0, 8)} (${entry.gameType})`
    if (entry.type === 'phase-change') return `[phase] round ${entry.roundNum}: ${entry.status}`
    if (entry.type === 'bot-action') return `[bot] ${entry.botName}: ${entry.action}`
    if (entry.type === 'error') return `[error] ${entry.botName ?? 'swarm'}: ${entry.message}`
    if (entry.type === 'status') return `[status] ${entry.message}`
    return null
  }

  snapshot(reason, game, round, players) {
    this.snapshots.push({
      ts: new Date().toISOString(),
      reason,
      game: sanitizeGame(game),
      round: sanitizeRound(round),
      players: players.map((player) => ({ id: player.id, name: player.name, score: player.score, eggs: player.eggs, connected: player.connected })),
    })
    fs.writeFileSync(this.snapshotsPath, JSON.stringify(this.snapshots, null, 2))
  }

  geminiUsage(usage) {
    this.geminiCalls += 1
    this.inputTokens += usage?.promptTokenCount ?? 0
    this.outputTokens += usage?.candidatesTokenCount ?? 0
  }

  writeSummary({ args, gameType, game, players, startedAt, endedAt, stoppedReason }) {
    const elapsedMs = endedAt - startedAt
    const roughCost = ((this.inputTokens / 1_000_000) * 0.10) + ((this.outputTokens / 1_000_000) * 0.40)
    const finalScores = players
      .map((player) => `- ${player.name}: ${gameType === 'flock-together' ? `${player.eggs ?? 0} eggs` : `${player.score ?? 0} pts`}`)
      .join('\n') || '- No players snapshot captured'
    const stuckPhases = this.errors.filter((event) => event.code === 'stuck-phase')
    const failedCalls = this.errors.filter((event) => event.callable)
    const status = this.errors.length === 0 ? 'PASS' : 'FAIL'
    const summary = [
      `# Bot Swarm Run`,
      ``,
      `**Status:** ${status}`,
      `**Game type:** ${gameType ?? 'unknown'}`,
      `**Room code:** ${args.code}`,
      `**Bots:** ${args.count}`,
      `**Stopped reason:** ${stoppedReason}`,
      `**Elapsed:** ${(elapsedMs / 1000).toFixed(1)}s`,
      ``,
      `## Activity`,
      ``,
      `- Bot actions: ${this.actions}`,
      `- Phase changes: ${this.phaseChanges.length}`,
      `- Errors: ${this.errors.length}`,
      `- Stuck phases: ${stuckPhases.length}`,
      `- Failed callables: ${failedCalls.length}`,
      ``,
      `## Gemini`,
      ``,
      `- Calls: ${this.geminiCalls}`,
      `- Prompt tokens: ${this.inputTokens}`,
      `- Output tokens: ${this.outputTokens}`,
      `- Rough cost estimate: $${roughCost.toFixed(4)}`,
      ``,
      `## Final Scores`,
      ``,
      finalScores,
      ``,
      `## Artifacts`,
      ``,
      `- events.jsonl`,
      `- snapshots.json`,
    ].join('\n')
    fs.writeFileSync(path.join(this.runDir, 'summary.md'), summary)
  }
}

function sanitizeGame(game) {
  if (!game) return null
  return {
    id: game.id,
    code: game.code,
    gameType: game.gameType,
    status: game.status,
    currentRound: game.currentRound,
    currentGuesser: game.currentGuesser,
    rottenEggHolder: game.rottenEggHolder,
    playerCount: game.playerIds?.length ?? 0,
    settings: game.settings,
  }
}

function sanitizeRound(round) {
  if (!round) return null
  const base = {
    id: round.id,
    status: round.status,
    currentAttempt: round.currentAttempt,
    maxAttempts: round.maxAttempts,
    answerCount: round.answerCount,
    eligiblePlayerCount: round.eligiblePlayerCount,
    visibleGroupIndexes: round.visibleGroupIndexes,
    clueGroupCount: round.clueGroups?.length,
    guessAttempts: round.guessAttempts,
    isCorrect: round.isCorrect,
    results: round.results,
    pointsThisRound: round.pointsThisRound,
  }
  if (round.status === 'word-selection') base.wordOptionsCount = round.wordOptions?.length ?? 0
  if (round.status === 'clue-submission' || round.status === 'deduplication' || round.status === 'reveal' || round.status === 'guess' || round.status === 'scored') {
    base.clueCount = Object.keys(round.cluesByPlayer ?? {}).length
  }
  if (round.question) {
    base.question = round.question
    base.type = round.type
    base.options = round.options
  }
  return base
}

class GeminiClient {
  constructor({ apiKey, model, reporter }) {
    this.apiKey = apiKey
    this.model = model
    this.reporter = reporter
  }

  async generateText(task, prompt, { maxTokens = 32 } = {}) {
    const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    this.reporter.event('gemini-prompt', { task, prompt: sanitizeModelOutput(prompt) })
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: maxTokens,
        },
      }),
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Gemini ${task} failed (${response.status}): ${body.slice(0, 300)}`)
    }
    const data = await response.json()
    this.reporter.geminiUsage(data.usageMetadata)
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim()
    if (!text) throw new Error(`Gemini ${task} returned no text`)
    this.reporter.event('gemini', { task, output: sanitizeModelOutput(text) })
    return text
  }
}

function sanitizeModelOutput(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function oneWord(text) {
  const cleaned = text
    .replace(/[`"'.,!?;:()[\]{}]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .find(Boolean)
  return (cleaned || '').replace(/[^a-zA-Z-]/g, '').slice(0, 50)
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function visibleGroups(round) {
  const groups = round.clueGroups ?? []
  return (round.visibleGroupIndexes ?? [])
    .map((index) => ({ index, group: groups[index] }))
    .filter(({ group }) => Boolean(group))
}

function groupText(group) {
  return [...new Set(group.clueTexts ?? [])].join(', ')
}

function roundMatchesGame(game, round) {
  return String(round?.id ?? '') === String(game?.currentRound ?? '')
}

class Bot {
  constructor({ index, config, args, gemini, reporter }) {
    this.index = index
    this.name = `${botNames[index % botNames.length]} Bot ${index + 1}`
    this.args = args
    this.gemini = gemini
    this.reporter = reporter
    this.app = initializeApp(config, `bot-${index + 1}-${Date.now()}`)
    this.auth = getAuth(this.app)
    this.db = getFirestore(this.app)
    this.functions = getFunctions(this.app)
    this.rtdb = getDatabase(this.app)
    connectAuthEmulator(this.auth, `http://${args.host}:9099`, { disableWarnings: true })
    connectFirestoreEmulator(this.db, args.host, 8080)
    connectFunctionsEmulator(this.functions, args.host, 5001)
    connectDatabaseEmulator(this.rtdb, args.host, 9000)
    this.actions = new Set()
    this.unsubscribes = []
    this.uid = null
    this.gameId = null
    this.gameType = null
    this.latestGame = null
    this.latestRound = null
    this.latestPlayers = []
  }

  async join() {
    const credential = await signInAnonymously(this.auth)
    this.uid = credential.user.uid
    const result = await this.call('joinGame', { code: this.args.code, playerName: this.name })
    this.gameId = result.gameId
    this.gameType = result.gameType
    await this.markPresence(true)
    this.reporter.event('join', { botName: this.name, uid: this.uid, gameId: this.gameId, gameType: this.gameType })
  }

  listen(onUpdate) {
    this.unsubscribes.push(onSnapshot(doc(this.db, 'games', this.gameId), (snap) => {
      this.latestGame = snap.exists() ? { id: snap.id, ...snap.data() } : null
      this.attachRoundListener()
      onUpdate()
    }, (err) => this.reporter.event('error', { botName: this.name, message: err.message })))
    this.unsubscribes.push(onSnapshot(collection(this.db, 'games', this.gameId, 'players'), (snap) => {
      this.latestPlayers = snap.docs.map((playerDoc) => ({ id: playerDoc.id, ...playerDoc.data() }))
      onUpdate()
    }, (err) => this.reporter.event('error', { botName: this.name, message: err.message })))
  }

  attachRoundListener() {
    const roundNum = this.latestGame?.currentRound
    if (!roundNum || this.roundListenerNum === roundNum) return
    if (this.roundUnsubscribe) this.roundUnsubscribe()
    this.roundListenerNum = roundNum
    this.latestRound = null
    this.roundUnsubscribe = onSnapshot(doc(this.db, 'games', this.gameId, 'rounds', String(roundNum)), (snap) => {
      this.latestRound = snap.exists() ? { id: snap.id, ...snap.data() } : null
      this.handleUpdate().catch((err) => this.reporter.event('error', { botName: this.name, message: err.message }))
    }, (err) => this.reporter.event('error', { botName: this.name, message: err.message }))
  }

  async handleUpdate() {
    const game = this.latestGame
    const round = this.latestRound
    if (!game || !round || game.status !== 'playing') return
    if (!roundMatchesGame(game, round)) return
    if (game.gameType === 'fowl-words') await this.handleFowlWords(game, round)
    if (game.gameType === 'flock-together') await this.handleFlockTogether(game, round)
  }

  async handleFowlWords(game, round) {
    const roundNum = game.currentRound
    const isGuesser = game.currentGuesser === this.uid
    if (round.status === 'word-selection' && !isGuesser && !round.wordVotes?.[this.uid]) {
      const options = round.wordOptions ?? []
      if (options.length === 0) return
      await this.once(`fowl:word-vote:${roundNum}`, async () => {
        const wordIndex = Math.floor(Math.random() * Math.min(3, options.length))
        await this.call('fowlWordsSubmitWordVote', { gameId: this.gameId, roundNum, wordIndex })
        this.reporter.event('bot-action', { botName: this.name, action: `voted for word option ${wordIndex + 1}`, roundNum })
      })
    }

    if (round.status === 'clue-submission' && !isGuesser && !round.cluesByPlayer?.[this.uid]) {
      await this.once(`fowl:clue:${roundNum}`, async () => {
        const clue = await this.makeClue(round.secretWord)
        await this.call('submitClue', { gameId: this.gameId, roundNum, clue })
        this.reporter.event('bot-action', { botName: this.name, action: `submitted clue "${clue}"`, roundNum })
      })
    }

    if ((round.status === 'reveal' || round.status === 'guess') && !isGuesser) {
      await this.castGiverAwards(roundNum, round)
    }

    if ((round.status === 'reveal' || round.status === 'guess') && isGuesser) {
      if ((round.visibleGroupIndexes ?? []).length === 0 && (round.clueGroups ?? []).length > 0) {
        await this.once(`fowl:unlock:${roundNum}:${round.currentAttempt}`, async () => {
          await this.call('fowlWordsUnlockFirst', { gameId: this.gameId, roundNum })
          this.reporter.event('bot-action', { botName: this.name, action: 'unlocked first clue group', roundNum })
        })
        return
      }
      if (round.attemptInProgress) return
      await this.once(`fowl:guess:${roundNum}:${round.currentAttempt}`, async () => {
        const guess = await this.makeGuess(round)
        await this.call('submitGuess', { gameId: this.gameId, roundNum, guess })
        this.reporter.event('bot-action', { botName: this.name, action: `guessed "${guess}"`, roundNum })
      })
    }

    if (round.status === 'scored' && isGuesser) {
      await this.castGuesserAwards(roundNum, round)
    }
  }

  async handleFlockTogether(game, round) {
    const roundNum = game.currentRound
    if (round.status !== 'answering') return
    if ((round.answeredPlayerIds ?? []).includes(this.uid)) return
    await this.once(`flock:answer:${roundNum}`, async () => {
      const answer = round.type === 'multiple_choice'
        ? randomChoice(round.options ?? [])
        : await this.makeFlockAnswer(round.question)
      if (!answer) throw new Error('No answer available for round')
      await this.call('submitAnswer', { gameId: this.gameId, roundNum, answer })
      this.reporter.event('bot-action', { botName: this.name, action: `answered "${answer}"`, roundNum })
    })
  }

  async castGiverAwards(roundNum, round) {
    const visible = visibleGroups(round).filter(({ group }) => !(group.playerIds ?? []).includes(this.uid))
    const signature = visible.map(({ index }) => index).join(',')
    if (!signature) return
    await this.once(`fowl:giver-love:${roundNum}:${signature}`, async () => {
      for (const { index } of visible) {
        if (Math.random() < 0.4) {
          await this.call('fowlWordsSubmitCluePeerLove', { gameId: this.gameId, roundNum, groupIndex: index })
          this.reporter.event('bot-action', { botName: this.name, action: `gave Peer love to clue group ${index}`, roundNum })
          await sleep(100)
        }
      }
    })
    await this.once(`fowl:giver-boo:${roundNum}`, async () => {
      if (Math.random() < 0.1 && visible.length > 0) {
        const { index } = randomChoice(visible)
        await this.call('fowlWordsSubmitCluePeerBoo', { gameId: this.gameId, roundNum, groupIndex: index })
        this.reporter.event('bot-action', { botName: this.name, action: `gave Boo to clue group ${index}`, roundNum })
      }
    })
  }

  async castGuesserAwards(roundNum, round) {
    const visible = visibleGroups(round)
    if (visible.length === 0) return
    await this.once(`fowl:most-helpful:${roundNum}`, async () => {
      if (round.isCorrect && Math.random() < 0.6) {
        const { index } = randomChoice(visible)
        await this.call('fowlWordsSubmitGuesserMostHelpful', { gameId: this.gameId, roundNum, groupIndex: index })
        this.reporter.event('bot-action', { botName: this.name, action: `awarded Most Helpful to clue group ${index}`, roundNum })
      }
    })
    await this.once(`fowl:guesser-boo:${roundNum}`, async () => {
      if (Math.random() < 0.1) {
        const { index } = randomChoice(visible)
        await this.call('fowlWordsSubmitGuesserBoo', { gameId: this.gameId, roundNum, groupIndex: index })
        this.reporter.event('bot-action', { botName: this.name, action: `gave result Boo to clue group ${index}`, roundNum })
      }
    })
  }

  async makeClue(secretWord) {
    const prompt = [
      'You are playing a party word game like Just One.',
      `Secret word: ${secretWord}`,
      'Give exactly one helpful English clue word.',
      'Do not use the secret word, a substring of it, punctuation, spaces, or explanation.',
    ].join('\n')
    const text = await this.gemini.generateText('fowl-clue', prompt)
    const clue = oneWord(text)
    if (!clue) throw new Error('Gemini did not produce a one-word clue')
    if (secretWord.toLowerCase().includes(clue.toLowerCase())) throw new Error(`Generated clue "${clue}" is part of the secret word`)
    return clue
  }

  async makeGuess(round) {
    const clues = visibleGroups(round)
      .map(({ index, group }) => `Group ${index}: ${groupText(group)}`)
      .join('\n')
    const previous = (round.guessAttempts ?? []).join(', ') || 'none'
    const prompt = [
      'You are the guesser in a party word game.',
      'Infer the hidden one-word answer using only these visible clue groups.',
      clues || 'No visible clues.',
      `Previous guesses: ${previous}`,
      'Return exactly one English word as your guess. No explanation.',
    ].join('\n')
    return oneWord(await this.gemini.generateText('fowl-guess', prompt)) || 'pass'
  }

  async makeFlockAnswer(question) {
    const prompt = [
      'Answer this party-game prompt like a casual player trying to match the majority.',
      `Prompt: ${question}`,
      'Return a short answer only. No explanation.',
    ].join('\n')
    return sanitizeModelOutput(await this.gemini.generateText('flock-answer', prompt, { maxTokens: 48 })).slice(0, 100)
  }

  async once(key, action) {
    if (this.actions.has(key)) return
    this.actions.add(key)
    try {
      await action()
    } catch (err) {
      this.actions.delete(key)
      this.reporter.event('error', { botName: this.name, message: err.message, key })
    }
  }

  async call(name, data) {
    try {
      const result = await httpsCallable(this.functions, name)(data)
      this.reporter.event('callable-result', { botName: this.name, callable: name, ok: true })
      return result.data
    } catch (err) {
      this.reporter.event('error', { botName: this.name, message: err.message, callable: name })
      throw err
    }
  }

  async markPresence(connected) {
    await set(ref(this.rtdb, `status/${this.gameId}/${this.uid}`), {
      connected,
      lastSeen: serverTimestamp(),
    })
  }

  async stop() {
    for (const unsubscribe of this.unsubscribes) unsubscribe()
    if (this.roundUnsubscribe) this.roundUnsubscribe()
    if (this.gameId && this.uid) {
      try {
        await this.markPresence(false)
      } catch {
        // Best-effort cleanup only.
      }
    }
    await deleteApp(this.app)
  }
}

class Swarm {
  constructor({ args, config, gemini, reporter }) {
    this.args = args
    this.config = config
    this.gemini = gemini
    this.reporter = reporter
    this.bots = []
    this.lastPhaseKey = ''
    this.startedAt = Date.now()
    this.stopped = false
    this.stoppedReason = 'not stopped'
  }

  async start() {
    for (let i = 0; i < this.args.count; i += 1) {
      const bot = new Bot({ index: i, config: this.config, args: this.args, gemini: this.gemini, reporter: this.reporter })
      await bot.join()
      this.bots.push(bot)
      await sleep(150)
    }
    for (const bot of this.bots) bot.listen(() => this.monitor())
    this.reporter.event('status', { message: `Bots joined. Waiting for host to start room ${this.args.code}.` })
    await this.waitUntilStopped()
  }

  monitor() {
    if (this.stopped) return
    const bot = this.bots[0]
    const game = bot?.latestGame
    const round = bot?.latestRound
    const players = bot?.latestPlayers ?? []
    if (!game) return
    if (game.status === 'finished' || game.status === 'abandoned') {
      this.stop(`game ${game.status}`).catch((err) => this.reporter.event('error', { message: err.message }))
      return
    }
    if (round && roundMatchesGame(game, round)) {
      const phaseKey = `${game.currentRound}:${round.status}:${round.currentAttempt ?? ''}`
      if (phaseKey !== this.lastPhaseKey) {
        this.lastPhaseKey = phaseKey
        this.reporter.event('phase-change', { roundNum: game.currentRound, status: round.status, attempt: round.currentAttempt })
        this.reporter.snapshot('phase-change', game, round, players)
      }
    }
  }

  async waitUntilStopped() {
    while (!this.stopped) {
      await sleep(500)
    }
  }

  async stop(reason) {
    if (this.stopped) return
    this.stopped = true
    this.stoppedReason = reason
    const bot = this.bots[0]
    const game = bot?.latestGame ?? null
    const players = bot?.latestPlayers ?? []
    this.reporter.event('status', { message: `Stopping swarm: ${reason}` })
    await Promise.allSettled(this.bots.map((b) => b.stop()))
    this.reporter.writeSummary({
      args: this.args,
      gameType: game?.gameType ?? this.bots[0]?.gameType,
      game,
      players,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      stoppedReason: reason,
    })
  }
}

async function main() {
  loadEnvFile(path.join(rootDir, '.env'))
  loadEnvFile(path.join(rootDir, 'functions/.env'))
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY must be set in the environment or functions/.env')
  const config = firebaseConfigFromEnv()
  const runDir = makeRunDir()
  const reporter = new Reporter(runDir)
  const gemini = new GeminiClient({ apiKey, model: args.model, reporter })
  reporter.event('status', { message: `Writing artifacts to ${path.relative(rootDir, runDir)}` })
  reporter.event('status', { message: `Using local emulators at ${args.host}: Auth 9099, Firestore 8080, Functions 5001, RTDB 9000` })
  const swarm = new Swarm({ args, config, gemini, reporter })
  process.on('SIGINT', () => {
    swarm.stop('interrupted').then(() => process.exit(130))
  })
  await swarm.start()
}

main().catch((err) => {
  console.error(`[fatal] ${err.message}`)
  process.exit(1)
})
