// Voix neuronale Kokoro-82M (onnxruntime WebAssembly), hors du fil principal.
// Génère l'audio phrase par phrase pour commencer à parler sans attendre la fin du texte.
import { KokoroTTS } from 'kokoro-js'
import { env } from '@huggingface/transformers'
import { sentences } from './split'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'

env.allowLocalModels = false
env.useBrowserCache = true

let tts: KokoroTTS | null = null
let loading: Promise<KokoroTTS> | null = null
let current = 0 // id de la requête en cours ; les autres sont abandonnées

type Msg =
  | { type: 'load' }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }
  | { type: 'cancel' }

function load(): Promise<KokoroTTS> {
  if (tts) return Promise.resolve(tts)
  if (loading) return loading
  ;(env.backends.onnx as any).wasm.wasmPaths = {
    mjs: new URL(ortMjs, self.location.href).href,
    wasm: new URL(ortWasm, self.location.href).href,
  }
  const files: Record<string, { loaded: number; total: number }> = {}
  loading = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: any) => {
      if (p.status === 'progress' && p.file) {
        files[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 }
        const v = Object.values(files)
        const tot = v.reduce((a, f) => a + f.total, 0)
        self.postMessage({ type: 'progress', value: tot ? v.reduce((a, f) => a + f.loaded, 0) / tot : 0 })
      }
    },
  }).then((t) => { tts = t; return t }, (e) => { loading = null; throw e })
  return loading
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      await load()
      self.postMessage({ type: 'ready' })
    } else if (m.type === 'cancel') {
      current = -1
    } else if (m.type === 'speak') {
      current = m.id
      const t = await load()
      for (const s of sentences(m.text)) {
        if (current !== m.id) return
        const audio = await t.generate(s, { voice: m.voice as any, speed: m.speed })
        if (current !== m.id) return
        const samples = new Float32Array((audio as any).data ?? audio.audio)
        self.postMessage({ type: 'audio', id: m.id, samples, rate: audio.sampling_rate }, [samples.buffer] as any)
      }
      self.postMessage({ type: 'done', id: m.id })
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: (m as any).id, message: String((err as Error)?.message ?? err) })
  }
}
