// Synthèse vocale :
//  - « neural » : voix Kokoro-82M générée sur l'appareil (naturelle, vraie prononciation anglaise) ;
//  - « system » : voix installées dans Windows / Android (dépend de ce qui est installé).
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech'
import { isAndroid, isMock } from '../platform'
import { getState } from '../store'

export interface VoiceOpt { name: string; lang: string; index: number }

export const NEURAL_VOICES = [
  { id: 'af_heart', label: 'Heart — américaine (femme)', accent: 'en-US' },
  { id: 'af_bella', label: 'Bella — américaine (femme)', accent: 'en-US' },
  { id: 'am_michael', label: 'Michael — américain (homme)', accent: 'en-US' },
  { id: 'am_fenrir', label: 'Fenrir — américain (homme)', accent: 'en-US' },
  { id: 'bf_emma', label: 'Emma — britannique (femme)', accent: 'en-GB' },
  { id: 'bm_george', label: 'George — britannique (homme)', accent: 'en-GB' },
]

// ---------- voix du système ----------
export async function listVoices(): Promise<VoiceOpt[]> {
  if (isAndroid) {
    const { voices } = await TextToSpeech.getSupportedVoices()
    return voices.map((v, i) => ({ name: v.name, lang: v.lang, index: i })).filter((v) => /^en/i.test(v.lang))
  }
  if (typeof speechSynthesis === 'undefined') return []
  let v = speechSynthesis.getVoices()
  if (!v.length) {
    await new Promise<void>((r) => { speechSynthesis.onvoiceschanged = () => r(); setTimeout(r, 1500) })
    v = speechSynthesis.getVoices()
  }
  return v.map((x, i) => ({ name: x.name, lang: x.lang, index: i })).filter((x) => /^en/i.test(x.lang))
}

/** Choisit une voix anglaise ; ne retombe jamais sur une voix française. */
export function pickEnglishVoice(all: { name: string; lang: string }[], wanted: string, lang: string) {
  const norm = (l: string) => l.replace('_', '-').toLowerCase()
  return all.find((x) => x.name === wanted)
    ?? all.find((x) => norm(x.lang) === lang.toLowerCase())
    ?? all.find((x) => norm(x.lang).startsWith('en'))
    ?? null
}

let warnedNoEnglish = false
export let onNoEnglishVoice: () => void = () => {}
export function setNoEnglishVoiceHandler(fn: () => void) { onNoEnglishVoice = fn }

async function speakSystem(clean: string, o: { rate: number; voice: string; lang: string }) {
  if (isAndroid) {
    const voices = o.voice ? await listVoices() : []
    const v = voices.find((x) => x.name === o.voice)
    await TextToSpeech.speak({ text: clean, lang: o.lang, rate: o.rate, voice: v?.index, queueStrategy: QueueStrategy.Flush })
    return
  }
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = o.lang
  u.rate = o.rate
  const voice = pickEnglishVoice(speechSynthesis.getVoices(), o.voice, o.lang)
  if (voice) u.voice = voice as SpeechSynthesisVoice
  else if (!warnedNoEnglish) { warnedNoEnglish = true; onNoEnglishVoice() }
  await new Promise<void>((res) => {
    u.onend = () => res(); u.onerror = () => res()
    speechSynthesis.speak(u)
    setTimeout(res, 2000 + clean.length * 120) // garde-fou : certains moteurs n'émettent pas onend
  })
}

// ---------- voix neuronale (Kokoro) ----------
let worker: Worker | null = null
let ready: Promise<void> | null = null
let reqId = 0
let ctx: AudioContext | null = null
let sources: AudioBufferSourceNode[] = []
let stopCurrent: (() => void) | null = null

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function neuralLoaded(): boolean { return !!ready }

export function loadNeural(onProgress?: (p: number) => void): Promise<void> {
  if (isMock) return Promise.resolve()
  if (ready) return ready
  const w = getWorker()
  ready = new Promise<void>((res, rej) => {
    const h = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'progress') onProgress?.(m.value)
      else if (m.type === 'ready') { w.removeEventListener('message', h); res() }
      else if (m.type === 'error' && m.id == null) { w.removeEventListener('message', h); ready = null; rej(new Error(m.message)) }
    }
    w.addEventListener('message', h)
    w.postMessage({ type: 'load' })
  })
  return ready
}

async function speakNeural(clean: string, o: { rate: number; voice: string }) {
  await loadNeural()
  const w = getWorker()
  const id = ++reqId
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const ac = ctx
  let nextAt = ac.currentTime + 0.05
  let pendingEnd = Promise.resolve()
  let cancelled = false
  await new Promise<void>((resolve, reject) => {
    const finish = () => { w.removeEventListener('message', h); stopCurrent = null; resolve() }
    stopCurrent = () => { cancelled = true; finish() }
    const h = (e: MessageEvent) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'audio' && !cancelled) {
        const buf = ac.createBuffer(1, m.samples.length, m.rate)
        buf.copyToChannel(m.samples, 0)
        const src = ac.createBufferSource()
        src.buffer = buf
        src.connect(ac.destination)
        nextAt = Math.max(nextAt, ac.currentTime + 0.02)
        src.start(nextAt)
        nextAt += buf.duration
        sources.push(src)
        pendingEnd = new Promise<void>((r) => { src.onended = () => { sources = sources.filter((s) => s !== src); r() } })
      } else if (m.type === 'done') {
        void pendingEnd.then(() => { if (!cancelled) finish() })
      } else if (m.type === 'error') {
        w.removeEventListener('message', h); stopCurrent = null; reject(new Error(m.message))
      }
    }
    w.addEventListener('message', h)
    w.postMessage({ type: 'speak', id, text: clean, voice: o.voice || 'af_heart', speed: o.rate })
  })
}

// ---------- API commune ----------
let speaking = false
export function isSpeaking() { return speaking }

export async function speak(text: string, o: { rate: number; voice: string; lang: string }): Promise<void> {
  const clean = text.replace(/[*_#`>]/g, '').trim()
  if (!clean) return
  speaking = true
  try {
    if (isMock) { await new Promise((r) => setTimeout(r, Math.min(1500, clean.length * 15))); return }
    const s = getState().settings
    if (s.ttsEngine === 'neural') {
      try { await speakNeural(clean, { rate: o.rate, voice: s.neuralVoice }); return } catch (e) {
        console.warn('Voix neuronale indisponible, voix du système :', (e as Error).message)
      }
    }
    await speakSystem(clean, o)
  } finally { speaking = false }
}

export async function stopSpeaking(): Promise<void> {
  speaking = false
  if (stopCurrent) { worker?.postMessage({ type: 'cancel' }); stopCurrent() }
  for (const s of sources) { try { s.stop() } catch { /* déjà arrêtée */ } }
  sources = []
  if (isAndroid) await TextToSpeech.stop().catch(() => undefined)
  else if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
