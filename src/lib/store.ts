// État persistant de l'application (localStorage). Tout reste sur l'appareil.
import type { Card } from './srs'

export type SttEngine = 'whisper' | 'native' | 'cloud'
export type Level = 'B1' | 'B2' | 'C1'

export interface Settings {
  llmModel: string // id du catalogue, ou 'custom'
  customModelUrl: string
  sttEngine: SttEngine
  whisperModel: string
  ttsRate: number
  voice: string // nom de la voix ('' = défaut)
  accent: 'en-US' | 'en-GB'
  level: Level
  explainInFrench: boolean
  handsFree: boolean // écoute automatique après chaque réponse du tuteur
  dailyGoalMin: number
  correctionMode: 'every' | 'end' // corrections à chaque tour ou en fin de séance
  gpu: boolean // accélération WebGPU (rapide mais instable sur certains téléphones)
  groqKey: string // clé API Groq (stockée uniquement sur l'appareil)
  groqModel: string
  privateMode: boolean // force l'IA locale (rien n'est envoyé en ligne)
}

export interface DayStat {
  date: string // AAAA-MM-JJ
  speakingSec: number
  words: number
  turns: number
  mistakes: number
  shadowSum: number
  shadowCount: number
  reviews: number
}

export interface SessionLog {
  id: string
  date: number
  scenario: string
  turns: number
  words: number
  speakingSec: number
  mistakes: number
  summary: string
}

export interface AppState {
  version: 1
  settings: Settings
  cards: Card[]
  days: Record<string, DayStat>
  sessions: SessionLog[]
  onboarded: boolean
}

const KEY = 'fluent.state.v1'

export function defaultSettings(isAndroid: boolean): Settings {
  return {
    llmModel: isAndroid ? 'gemma3-1b' : 'qwen25-3b',
    customModelUrl: '',
    sttEngine: isAndroid ? 'native' : 'whisper',
    whisperModel: isAndroid ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-base.en',
    ttsRate: 1,
    voice: '',
    accent: 'en-US',
    level: 'B2',
    explainInFrench: false,
    handsFree: true,
    dailyGoalMin: 20,
    correctionMode: 'every',
    gpu: false,
    groqKey: '',
    groqModel: 'llama-3.3-70b-versatile',
    privateMode: false,
  }
}

function fresh(isAndroid: boolean): AppState {
  return { version: 1, settings: defaultSettings(isAndroid), cards: [], days: {}, sessions: [], onboarded: false }
}

let state: AppState
const listeners = new Set<() => void>()

export function initStore(isAndroid: boolean): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as AppState
      state = { ...fresh(isAndroid), ...s, settings: { ...defaultSettings(isAndroid), ...s.settings } }
      return state
    }
  } catch { /* état corrompu : on repart de zéro */ }
  state = fresh(isAndroid)
  return state
}

export function getState(): AppState { return state }

export function update(fn: (s: AppState) => void): void {
  fn(state)
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* stockage plein */ }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function today(s: AppState = state): DayStat {
  const k = todayKey()
  return s.days[k] ?? { date: k, speakingSec: 0, words: 0, turns: 0, mistakes: 0, shadowSum: 0, shadowCount: 0, reviews: 0 }
}

export function bumpToday(patch: Partial<Omit<DayStat, 'date'>>): void {
  update((s) => {
    const d = { ...today(s) }
    for (const [k, v] of Object.entries(patch)) (d as any)[k] += v as number
    s.days[d.date] = d
  })
}

/** Jours consécutifs avec au moins une activité (aujourd'hui inclus s'il est actif). */
export function streak(s: AppState = state, now = new Date()): number {
  const active = (k: string) => {
    const d = s.days[k]
    return !!d && (d.turns > 0 || d.reviews > 0 || d.shadowCount > 0)
  }
  let n = 0
  const d = new Date(now)
  if (!active(todayKey(d))) d.setDate(d.getDate() - 1)
  while (active(todayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

export function exportJson(): string { return JSON.stringify(state, null, 2) }

export function importJson(json: string): void {
  const s = JSON.parse(json) as AppState
  if (s.version !== 1 || !Array.isArray(s.cards)) throw new Error('Fichier de sauvegarde invalide')
  update((cur) => Object.assign(cur, s))
}
