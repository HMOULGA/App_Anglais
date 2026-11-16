// Moteur de langage local. Implémentation réelle : wllama (llama.cpp en WebAssembly, dans un worker).
import { isMock } from '../platform'

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatOptions {
  maxTokens?: number
  temperature?: number
  onToken?: (textSoFar: string) => void
  jsonSchema?: object
  signal?: AbortSignal
}

export interface LLM {
  isReady(): boolean
  /** Charge le modèle (télécharge si absent du cache). progress ∈ [0,1] */
  load(url: string | File, onProgress: (p: number, phase: string) => void, opts?: { gpu: boolean }): Promise<void>
  chat(messages: ChatMsg[], opts?: ChatOptions): Promise<string>
  unload(): Promise<void>
  describe(): string
}

class WllamaLLM implements LLM {
  private w: any = null
  private loadedUrl = ''
  private queue: Promise<unknown> = Promise.resolve()

  isReady() { return !!this.w?.isModelLoaded() }

  describe() {
    if (!this.w?.isModelLoaded()) return 'aucun modèle chargé'
    const t = this.w.getNumThreads?.() ?? 1
    return `${this.loadedUrl.endsWith('#gpu') ? 'GPU + ' : 'CPU, '}${t} thread${t > 1 ? 's' : ''}${this.w.isMultithread?.() ? '' : ' (mode mono-thread)'}`
  }

  async load(src: string | File, onProgress: (p: number, phase: string) => void, opts = { gpu: false }) {
    const key = (typeof src === 'string' ? src : `file:${src.name}:${src.size}`) + (opts.gpu ? '#gpu' : '#cpu')
    if (this.isReady() && this.loadedUrl === key) return
    await this.unload()
    const { Wllama, LoggerWithoutDebug } = await import('@wllama/wllama')
    const wasm = (await import('@wllama/wllama/esm/wasm/wllama.wasm?url')).default
    this.w = new Wllama({ default: wasm }, { logger: LoggerWithoutDebug, allowOffline: true, parallelDownloads: 3 })
    // WebGPU donne des résultats faux sur beaucoup de GPU mobiles : CPU par défaut, GPU sur option
    const params = { n_ctx: 4096, n_batch: 512, n_gpu_layers: opts.gpu ? 999 : 0 }
    if (typeof src === 'string') {
      onProgress(0, 'Téléchargement du modèle')
      await this.w.loadModelFromUrl(src, {
        ...params,
        useCache: true,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) =>
          onProgress(total ? loaded / total : 0, 'Téléchargement du modèle'),
      })
    } else {
      onProgress(0.5, 'Lecture du fichier')
      await this.w.loadModel([src], params)
    }
    onProgress(1, 'Prêt')
    this.loadedUrl = key
  }

  chat(messages: ChatMsg[], opts: ChatOptions = {}): Promise<string> {
    // llama.cpp traite une requête à la fois : on sérialise.
    const run = async () => {
      if (!this.isReady()) throw new Error('Modèle non chargé')
      const base: any = {
        messages,
        max_tokens: opts.maxTokens ?? 200,
        temperature: opts.temperature ?? 0.7,
        top_p: 0.9,
        abortSignal: opts.signal,
      }
      if (opts.jsonSchema) {
        base.response_format = { type: 'json_schema', json_schema: { name: 'out', schema: opts.jsonSchema, strict: true } }
      }
      if (!opts.onToken) {
        const r = await this.w.createChatCompletion(base)
        return (r.choices?.[0]?.message?.content ?? '').trim()
      }
      let text = ''
      await this.w.createChatCompletion({
        ...base,
        stream: true,
        onData: (chunk: any) => {
          const d = chunk.choices?.[0]?.delta?.content
          if (d) { text += d; opts.onToken!(text) }
        },
      })
      return text.trim()
    }
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }

  async unload() {
    if (this.w) { try { await this.w.exit() } catch { /* déjà libéré */ } }
    this.w = null
    this.loadedUrl = ''
  }
}

/** Moteur factice pour développer l'interface sans modèle (ajouter ?mock à l'URL). */
class MockLLM implements LLM {
  private ready = false
  isReady() { return this.ready }
  describe() { return 'moteur de démonstration' }
  async load(_u: string | File, onProgress: (p: number, phase: string) => void) {
    for (let i = 1; i <= 5; i++) { await sleep(60); onProgress(i / 5, 'Téléchargement du modèle') }
    this.ready = true
  }
  async unload() { this.ready = false }
  async chat(messages: ChatMsg[], opts: ChatOptions = {}) {
    const last = messages[messages.length - 1]?.content ?? ''
    let out: string
    if (opts.jsonSchema) {
      if (/summary|recap/i.test(messages[0].content)) {
        out = JSON.stringify({
          strengths: 'You kept the conversation going and asked good follow-up questions.',
          focus: ['Past simple vs present perfect', 'Articles before countable nouns'],
          tip: 'Next time, try using "I have been working on…" for ongoing actions.',
        })
      } else {
        const said = (last.match(/"([^"]*)"\s*$/)?.[1] ?? last).trim()
        const wrong = /\bi go\b|\bhe go\b|\bpeoples\b|\bdepend of\b/i.test(said)
        out = JSON.stringify(wrong
          ? {
              ok: false,
              corrected: said.replace(/\bi go\b/i, 'I went').replace(/\bhe go\b/i, 'he goes').replace(/\bpeoples\b/i, 'people').replace(/\bdepend of\b/i, 'depend on'),
              explanation: 'Use the past simple for a finished time (yesterday).',
              better: 'Yesterday I went to the office early to finish my analysis.',
              expressions: [{ phrase: 'to get a head start on', meaning: 'commencer en avance' }],
            }
          : { ok: true, corrected: said, explanation: '', better: '', expressions: [{ phrase: 'that makes sense', meaning: "c'est logique" }] })
      }
    } else {
      out = "That's really interesting! Could you tell me a bit more about how you got into that?"
    }
    if (opts.onToken) {
      let acc = ''
      for (const w of out.split(/(?<=\s)/)) { acc += w; opts.onToken(acc); await sleep(25) }
    }
    return out
  }
}

/** URLs des modèles déjà téléchargés sur l'appareil (cache wllama). */
export async function cachedModelUrls(): Promise<string[]> {
  if (isMock) return []
  try {
    const { ModelManager } = await import('@wllama/wllama')
    const mm = new ModelManager()
    return (await mm.getModels()).map((m: any) => m.url)
  } catch { return [] }
}

export async function removeCachedModel(url: string): Promise<void> {
  const { ModelManager } = await import('@wllama/wllama')
  const mm = new ModelManager()
  for (const m of await mm.getModels({ includeInvalid: true })) if (m.url === url) await m.remove()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const llm: LLM = isMock ? new MockLLM() : new WllamaLLM()

/** Extrait un objet JSON d'une sortie de modèle (tolère du texte autour). */
export function parseJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T } catch { /* on tente d'isoler l'objet */ }
  const a = raw.indexOf('{'); const b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)) as T } catch { /* invalide */ } }
  return null
}
