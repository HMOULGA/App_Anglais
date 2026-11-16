// IA en ligne via Groq (API compatible OpenAI, quota gratuit) : conversation + Whisper large-v3.
import type { ChatMsg, ChatOptions } from './llm/engine'
import { getState } from './store'
import { isMock } from './platform'

const BASE = 'https://api.groq.com/openai/v1'

export const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — recommandé' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B — très bon en grammaire' },
  { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — ultra-rapide, quota large' },
]

export class CloudError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'CloudError' }
}

// Après une erreur de quota ou de réseau, on laisse le cloud de côté un moment.
let pausedUntil = 0
let pauseReason = ''

export function cloudConfigured(): boolean {
  const s = getState().settings
  return !isMock && !s.privateMode && s.groqKey.trim().length > 10
}

/** Le cloud est-il utilisable maintenant ? (clé, pas en mode privé, réseau, pas de quota épuisé) */
export function cloudUsable(): boolean {
  return cloudConfigured() && navigator.onLine !== false && Date.now() > pausedUntil
}

export function cloudStatus(): string {
  if (!cloudConfigured()) return getState().settings.privateMode ? 'mode privé : IA locale uniquement' : 'aucune clé : IA locale'
  if (navigator.onLine === false) return 'hors-ligne : IA locale'
  if (Date.now() <= pausedUntil) return `en pause (${pauseReason}) : IA locale`
  return 'Groq actif'
}

function pause(status: number) {
  // 429 = quota : on attend 2 min ; réseau/serveur : 30 s ; clé invalide : jusqu'à correction
  const ms = status === 429 ? 120_000 : status === 401 || status === 403 ? 3_600_000 : 30_000
  pausedUntil = Date.now() + ms
  pauseReason = status === 429 ? 'quota atteint' : status === 401 || status === 403 ? 'clé refusée' : 'réseau'
}

export function resetCloudPause() { pausedUntil = 0 }

async function errorFrom(res: Response): Promise<CloudError> {
  let msg = `Groq HTTP ${res.status}`
  try { msg = (await res.json())?.error?.message ?? msg } catch { /* corps vide */ }
  if (res.status === 401) msg = 'Clé Groq invalide'
  if (res.status === 429) msg = 'Quota Groq atteint (réessayez plus tard)'
  return new CloudError(msg, res.status)
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const key = getState().settings.groqKey.trim()
  let res: Response
  try {
    res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) } })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    pause(0)
    throw new CloudError('Groq injoignable (réseau)', 0)
  }
  if (!res.ok) {
    const err = await errorFrom(res)
    if (res.status === 429 || res.status === 401 || res.status === 403 || res.status >= 500) pause(res.status)
    throw err
  }
  return res
}

export async function cloudChat(messages: ChatMsg[], opts: ChatOptions = {}): Promise<string> {
  const s = getState().settings
  const body: Record<string, unknown> = {
    model: s.groqModel,
    messages,
    max_tokens: Math.max(opts.maxTokens ?? 200, opts.jsonSchema ? 400 : 0),
    temperature: opts.temperature ?? 0.7,
    stream: !!opts.onToken,
  }
  if (opts.jsonSchema) body.response_format = { type: 'json_object' }
  if (s.groqModel.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low'
  if (s.groqModel.startsWith('qwen/qwen3')) body.reasoning_format = 'hidden'
  const res = await call('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!opts.onToken) {
    const j = await res.json()
    return (j.choices?.[0]?.message?.content ?? '').trim()
  }
  // flux SSE : lignes « data: {...} »
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const l = line.trim()
      if (!l.startsWith('data:')) continue
      const data = l.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const d = JSON.parse(data).choices?.[0]?.delta?.content
        if (d) { text += d; opts.onToken(text) }
      } catch { /* ligne partielle */ }
    }
  }
  return text.trim()
}

// Une consigne au style « oral non corrigé » aide Whisper à garder les fautes au lieu de les réparer.
const VERBATIM_PROMPT = "Um, so, I go to the office yesterday and, uh, he don't like it, you know."

export async function cloudTranscribe(samples16k: Float32Array): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([encodeWav(samples16k, 16000)], { type: 'audio/wav' }), 'speech.wav')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'en')
  form.append('temperature', '0')
  form.append('response_format', 'json')
  form.append('prompt', VERBATIM_PROMPT)
  const res = await call('/audio/transcriptions', { method: 'POST', body: form })
  const j = await res.json()
  return String(j.text ?? '').trim()
}

/** Vérifie la clé avec une requête minuscule. */
export async function testCloud(): Promise<string> {
  resetCloudPause()
  const t0 = Date.now()
  const r = await cloudChat([{ role: 'user', content: 'Reply with just the word: ready' }], { maxTokens: 5, temperature: 0 })
  return `${r || 'ok'} (${Date.now() - t0} ms)`
}

/** WAV PCM 16 bits mono. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return buf
}
