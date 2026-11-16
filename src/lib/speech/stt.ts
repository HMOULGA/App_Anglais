// Reconnaissance vocale : Whisper local (toutes plateformes) ou moteur natif Android.
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { isAndroid, isMock } from '../platform'
import { record } from './recorder'
import { getState, type SttEngine } from '../store'
import { cloudUsable, cloudTranscribe } from '../cloud'

export interface SttResult { text: string; speechSec: number }

export interface ListenOptions {
  engine: SttEngine
  accent: string
  autoStop: boolean
  onLevel?: (level: number, speaking: boolean) => void
  onPartial?: (text: string) => void
  onTranscribing?: () => void
}

export interface ListenHandle { stop(): void; cancel(): void; result: Promise<SttResult> }

// ---------- Whisper ----------
let worker: Worker | null = null
let whisperModel = ''
let whisperReady: Promise<void> | null = null
let reqId = 0
const pending = new Map<number, { res: (t: string) => void; rej: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data
      if ((m.type === 'result' || m.type === 'error') && m.id != null) {
        const p = pending.get(m.id)
        pending.delete(m.id)
        if (m.type === 'result') p?.res(m.text)
        else p?.rej(new Error(m.message))
      }
    }
  }
  return worker
}

export function loadWhisper(model: string, onProgress?: (p: number) => void): Promise<void> {
  if (isMock) return Promise.resolve()
  if (whisperReady && whisperModel === model) return whisperReady
  whisperModel = model
  const w = getWorker()
  whisperReady = new Promise<void>((res, rej) => {
    const h = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'progress') onProgress?.(m.value)
      else if (m.type === 'ready') { w.removeEventListener('message', h); res() }
      else if (m.type === 'error' && m.id == null) { w.removeEventListener('message', h); whisperReady = null; rej(new Error(m.message)) }
    }
    w.addEventListener('message', h)
    w.postMessage({ type: 'load', model })
  })
  return whisperReady
}

export function whisperIsLoaded(model: string): boolean { return !!whisperReady && whisperModel === model }

function transcribe(audio: Float32Array): Promise<string> {
  const id = ++reqId
  return new Promise((res, rej) => {
    pending.set(id, { res, rej })
    getWorker().postMessage({ type: 'transcribe', id, audio }, [audio.buffer])
  })
}

async function listenWhisper(o: ListenOptions): Promise<ListenHandle> {
  const rec = await record({ autoStop: o.autoStop, onLevel: o.onLevel })
  const result = rec.result.then(async (r) => {
    if (!r.heardSpeech || r.samples.length < 16000 * 0.3) return { text: '', speechSec: 0 }
    o.onTranscribing?.()
    if (isMock) return { text: mockSentence(), speechSec: r.speechSec }
    const text = cleanTranscript(await transcribe(r.samples))
    return { text, speechSec: r.speechSec }
  })
  return { stop: rec.stop, cancel: rec.cancel, result }
}

// ---------- Android natif ----------
async function listenNative(o: ListenOptions): Promise<ListenHandle> {
  const perm = await SpeechRecognition.checkPermissions()
  if (perm.speechRecognition !== 'granted') {
    const r = await SpeechRecognition.requestPermissions()
    if (r.speechRecognition !== 'granted') throw new Error('Permission micro refusée')
  }
  let text = ''
  let t0 = 0
  let t1 = 0
  let finished = false
  let resolve!: (r: SttResult) => void
  let reject!: (e: unknown) => void
  const result = new Promise<SttResult>((res, rej) => { resolve = res; reject = rej })
  const end = async (cancel = false) => {
    if (finished) return
    finished = true
    await SpeechRecognition.removeAllListeners()
    if (cancel) reject(new DOMException('cancelled', 'AbortError'))
    else resolve({ text: cleanTranscript(text), speechSec: t0 ? Math.max(0.5, (t1 - t0) / 1000) : 0 })
  }
  await SpeechRecognition.addListener('partialResults', (d) => {
    const m = d.matches?.[0]
    if (m) { if (!t0) t0 = Date.now(); t1 = Date.now(); text = m; o.onPartial?.(m); o.onLevel?.(0.6, true) }
  })
  await SpeechRecognition.addListener('listeningState', (d) => {
    if (d.status === 'stopped') setTimeout(() => void end(), 250) // laisse arriver le dernier résultat partiel
  })
  SpeechRecognition.start({ language: o.accent, partialResults: true, popup: false, maxResults: 1 })
    .then((r) => { if (r?.matches?.[0]) { text = r.matches[0]; t1 = Date.now() } })
    .catch((e) => { if (!finished) { finished = true; reject(e) } })
  return {
    stop: () => { void SpeechRecognition.stop().finally(() => setTimeout(() => void end(), 400)) },
    cancel: () => { void SpeechRecognition.stop(); void end(true) },
    result,
  }
}

// ---------- Groq Whisper large-v3 (en ligne), repli sur Whisper local ----------
async function listenCloud(o: ListenOptions): Promise<ListenHandle> {
  const rec = await record({ autoStop: o.autoStop, onLevel: o.onLevel })
  const result = rec.result.then(async (r) => {
    if (!r.heardSpeech || r.samples.length < 16000 * 0.3) return { text: '', speechSec: 0 }
    o.onTranscribing?.()
    const copy = r.samples.slice()
    try {
      return { text: cleanTranscript(await cloudTranscribe(r.samples)), speechSec: r.speechSec }
    } catch (e) {
      console.warn('Transcription Groq impossible, repli Whisper local :', (e as Error).message)
      await loadWhisper(getState().settings.whisperModel)
      return { text: cleanTranscript(await transcribe(copy)), speechSec: r.speechSec }
    }
  })
  return { stop: rec.stop, cancel: rec.cancel, result }
}

export function listen(o: ListenOptions): Promise<ListenHandle> {
  if (o.engine === 'cloud' && cloudUsable()) return listenCloud(o)
  if ((o.engine === 'native' || o.engine === 'cloud') && isAndroid) return listenNative(o)
  return listenWhisper(o)
}

/** Nettoie les artefacts typiques de Whisper ([BLANK_AUDIO], (music), etc.). */
export function cleanTranscript(t: string): string {
  return t
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MOCK = [
  'Yesterday I go to the office early because I had a lot of work.',
  'I think carsharing could reduce emissions in big cities.',
  'It depend of the price and the availability of the cars.',
]
let mi = 0
function mockSentence() { return MOCK[mi++ % MOCK.length] }
