// Synthèse vocale hors-ligne : voix du système (Windows SAPI / moteur TTS Android).
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech'
import { isAndroid, isMock } from '../platform'

export interface VoiceOpt { name: string; lang: string; index: number }

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

let speaking = false
export function isSpeaking() { return speaking }

export async function speak(text: string, o: { rate: number; voice: string; lang: string }): Promise<void> {
  const clean = text.replace(/[*_#`>]/g, '').trim()
  if (!clean) return
  speaking = true
  try {
    if (isMock) { await new Promise((r) => setTimeout(r, Math.min(1500, clean.length * 15))); return }
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
    const all = speechSynthesis.getVoices()
    u.voice = all.find((x) => x.name === o.voice) ?? all.find((x) => x.lang.replace('_', '-') === o.lang) ?? null
    await new Promise<void>((res) => {
      u.onend = () => res(); u.onerror = () => res()
      speechSynthesis.speak(u)
      // garde-fou : certains moteurs n'émettent pas onend
      setTimeout(res, 2000 + clean.length * 120)
    })
  } finally { speaking = false }
}

export async function stopSpeaking(): Promise<void> {
  speaking = false
  if (isAndroid) await TextToSpeech.stop().catch(() => undefined)
  else if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
