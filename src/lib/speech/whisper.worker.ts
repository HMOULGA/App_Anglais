// Reconnaissance vocale Whisper (transformers.js + onnxruntime WebAssembly), hors du fil principal.
import { pipeline, env } from '@huggingface/transformers'
// binaires onnxruntime embarqués dans l'appli (pas de CDN → fonctionne hors-ligne)
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'

env.allowLocalModels = false
env.useBrowserCache = true

let asr: any = null
let current = ''

type Msg =
  | { type: 'load'; model: string }
  | { type: 'transcribe'; id: number; audio: Float32Array; prompt?: string }

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      if (asr && current === m.model) { self.postMessage({ type: 'ready' }); return }
      ;(env.backends.onnx as any).wasm.wasmPaths = {
        mjs: new URL(ortMjs, self.location.href).href,
        wasm: new URL(ortWasm, self.location.href).href,
      }
      const files: Record<string, { loaded: number; total: number }> = {}
      asr = await pipeline('automatic-speech-recognition', m.model, {
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
      })
      current = m.model
      self.postMessage({ type: 'ready' })
    } else if (m.type === 'transcribe') {
      if (!asr) throw new Error('Whisper non chargé')
      const out = await asr(m.audio, { chunk_length_s: 30, stride_length_s: 5, temperature: 0 })
      const text = (Array.isArray(out) ? out.map((o: any) => o.text).join(' ') : out.text) as string
      self.postMessage({ type: 'result', id: m.id, text: text.trim() })
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: (m as any).id, message: String((err as Error)?.message ?? err) })
  }
}
