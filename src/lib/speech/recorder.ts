// Enregistrement micro + détection de voix (VAD simple par énergie) + rééchantillonnage 16 kHz pour Whisper.

export interface RecordOptions {
  autoStop: boolean // s'arrête seul après un silence
  silenceMs?: number
  maxMs?: number
  onLevel?: (level: number, speaking: boolean) => void
}

export interface Recording {
  samples: Float32Array // mono 16 kHz
  speechSec: number // durée entre le début et la fin de la parole détectée
  heardSpeech: boolean
}

export interface RecorderHandle {
  stop(): void
  cancel(): void
  result: Promise<Recording>
}

export async function record(opts: RecordOptions): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  })
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  const rate = ctx.sampleRate
  let total = 0
  let floor = 0.01
  let calib = 0
  let firstVoice = -1
  let lastVoice = -1
  let done = false
  const silenceMs = opts.silenceMs ?? 1600
  const maxMs = opts.maxMs ?? 60_000

  let resolve!: (r: Recording) => void
  let reject!: (e: unknown) => void
  const result = new Promise<Recording>((res, rej) => { resolve = res; reject = rej })

  const cleanup = () => {
    proc.disconnect(); src.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  const finish = async (cancelled = false) => {
    if (done) return
    done = true
    cleanup()
    if (cancelled) { reject(new DOMException('cancelled', 'AbortError')); return }
    const all = new Float32Array(total)
    let o = 0
    for (const c of chunks) { all.set(c, o); o += c.length }
    // on garde un peu de marge autour de la parole
    const pad = Math.round(0.3 * rate)
    const a = firstVoice < 0 ? 0 : Math.max(0, firstVoice - pad)
    const b = lastVoice < 0 ? all.length : Math.min(all.length, lastVoice + pad)
    const trimmed = all.subarray(a, b)
    try {
      const samples = await resample(trimmed, rate, 16000)
      resolve({
        samples,
        speechSec: firstVoice < 0 ? 0 : (lastVoice - firstVoice) / rate,
        heardSpeech: firstVoice >= 0,
      })
    } catch (e) { reject(e) }
  }

  proc.onaudioprocess = (e) => {
    if (done) return
    const data = new Float32Array(e.inputBuffer.getChannelData(0))
    chunks.push(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)
    const t = total
    total += data.length
    // calibration du bruit de fond sur ~0,4 s
    if (calib < 0.4 * rate) { floor = calib === 0 ? rms : floor * 0.8 + rms * 0.2; calib += data.length }
    const speaking = rms > Math.max(0.012, floor * 2.5)
    if (speaking) { if (firstVoice < 0) firstVoice = t; lastVoice = t + data.length }
    opts.onLevel?.(Math.min(1, rms * 12), speaking)
    const elapsedMs = (total / rate) * 1000
    if (opts.autoStop && firstVoice >= 0 && ((total - lastVoice) / rate) * 1000 > silenceMs) void finish()
    if (elapsedMs > maxMs) void finish()
  }
  src.connect(proc)
  proc.connect(ctx.destination)

  return { stop: () => void finish(), cancel: () => void finish(true), result }
}

export async function resample(input: Float32Array, from: number, to: number): Promise<Float32Array> {
  if (from === to || input.length === 0) return new Float32Array(input)
  const len = Math.max(1, Math.round((input.length * to) / from))
  if (typeof OfflineAudioContext !== 'undefined') {
    const off = new OfflineAudioContext(1, len, to)
    const buf = off.createBuffer(1, input.length, from)
    buf.copyToChannel(new Float32Array(input), 0)
    const s = off.createBufferSource()
    s.buffer = buf
    s.connect(off.destination)
    s.start()
    const out = await off.startRendering()
    return out.getChannelData(0).slice()
  }
  // repli : interpolation linéaire
  const out = new Float32Array(len)
  const ratio = from / to
  for (let i = 0; i < len; i++) {
    const x = i * ratio; const i0 = Math.floor(x); const i1 = Math.min(i0 + 1, input.length - 1)
    out[i] = input[i0] + (input[i1] - input[i0]) * (x - i0)
  }
  return out
}
