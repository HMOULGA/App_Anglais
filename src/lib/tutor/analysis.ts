// Mesures de fluidité et comparaison mot à mot (shadowing, révisions orales).

const FILLERS = ['um', 'uh', 'er', 'erm', 'hmm', 'you know', 'i mean', 'kind of', 'sort of']

export function words(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean)
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Fluency { words: number; wpm: number; fillers: number }

export function fluency(text: string, speechSec: number): Fluency {
  const w = words(text)
  const n = normalize(text)
  let fillers = 0
  for (const f of FILLERS) fillers += (` ${n} `.match(new RegExp(` ${f} `, 'g')) ?? []).length
  const wpm = speechSec > 1 ? Math.round((w.length / speechSec) * 60) : 0
  // au-delà de ~260 mots/min la mesure de durée n'est pas fiable (voix mal détectée)
  return { words: w.length, wpm: wpm > 260 ? 0 : wpm, fillers }
}

export type WordStatus = 'ok' | 'missed' | 'wrong' | 'extra'
export interface WordDiff { word: string; heard?: string; status: WordStatus }

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am', "you're": 'you are', "it's": 'it is', "that's": 'that is', "don't": 'do not',
  "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not', "i've": 'i have',
  "we're": 'we are', "they're": 'they are', "i'd": 'i would', "i'll": 'i will', "isn't": 'is not',
  "aren't": 'are not', "let's": 'let us', "there's": 'there is', "we've": 'we have', "you've": 'you have',
}

function expand(ws: string[]): string[] {
  return ws.flatMap((w) => (CONTRACTIONS[w] ?? w).split(' '))
}

/** Aligne la phrase cible et la transcription (Levenshtein sur les mots). */
export function compareWords(target: string, heard: string): { diff: WordDiff[]; score: number } {
  const a = expand(words(target))
  const b = expand(words(heard))
  const n = a.length; const m = b.length
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = similar(a[i - 1], b[j - 1]) ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }
  const diff: WordDiff[] = []
  let i = n; let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (similar(a[i - 1], b[j - 1]) ? 0 : 1)) {
      const ok = similar(a[i - 1], b[j - 1])
      diff.push({ word: a[i - 1], heard: b[j - 1], status: ok ? 'ok' : 'wrong' }); i--; j--
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      diff.push({ word: a[i - 1], status: 'missed' }); i--
    } else {
      diff.push({ word: b[j - 1], status: 'extra' }); j--
    }
  }
  diff.reverse()
  const ok = diff.filter((x) => x.status === 'ok').length
  const extra = diff.filter((x) => x.status === 'extra').length
  const score = n === 0 ? 0 : Math.max(0, Math.round((100 * (ok - extra * 0.5)) / n))
  return { diff, score }
}

function similar(x: string, y: string): boolean {
  if (x === y) return true
  // tolère les variantes orthographiques que Whisper produit (colour/color, ok/okay…)
  const strip = (s: string) => s.replace(/our$/, 'or').replace(/ise$/, 'ize').replace(/^okay$/, 'ok').replace(/'/g, '')
  return strip(x) === strip(y)
}
